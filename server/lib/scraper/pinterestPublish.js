'use strict';
/**
 * pinterestPublish.js — create a Pin with the account you signed in with.
 *
 * The official v5 API needs an access token most people never create, so the
 * same session that already drives the scanner is used here: upload the image
 * the way the web app does, then call the PinResource the web app calls. No
 * third-party service, no developer app.
 *
 * The exact wire format of these internal calls drifts, so every step is
 * logged to data/debug/ when ORBITPRESS_PINTEREST_PROBE=1 and failures carry
 * the response body — that is what makes the next fix possible.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { requestText } = require('../http');
const { DATA_DIR } = require('../store');

/**
 * Hosts are read per call, not at module load: ORBITPRESS_PINTEREST_HOSTS is
 * how the tests point this at a mock, and a long-lived server may have its
 * environment reloaded.
 */
function hosts() {
  return String(process.env.ORBITPRESS_PINTEREST_HOSTS || 'https://www.pinterest.com,https://in.pinterest.com')
    .split(',')
    .map((host) => host.trim())
    .filter(Boolean);
}
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

function csrfFrom(cookieHeader) {
  const match = String(cookieHeader || '').split(';').map((p) => p.trim()).find((p) => p.startsWith('csrftoken='));
  return match ? decodeURIComponent(match.slice('csrftoken='.length)) : '';
}

function probe(tag, info) {
  if (process.env.ORBITPRESS_PINTEREST_PROBE !== '1') return;
  try {
    const dir = path.join(DATA_DIR, 'debug');
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    fs.writeFileSync(path.join(dir, `pinterest-publish-${tag}-${stamp}.txt`),
      Object.entries(info).map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`).join('\n').slice(0, 4000));
  } catch { /* probing must never break publishing */ }
}

function multipart(fields, file) {
  const boundary = `----orbitpress${crypto.randomBytes(12).toString('hex')}`;
  const chunks = [];
  for (const [name, value] of Object.entries(fields || {})) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
  }
  chunks.push(Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${file.field}"; filename="${file.filename}"\r\nContent-Type: ${file.mimeType}\r\n\r\n`),
    file.bytes,
    Buffer.from('\r\n'),
  ]));
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { body: Buffer.concat(chunks), contentType: `multipart/form-data; boundary=${boundary}` };
}

/** Step 1: upload the image the way the web app does. */
async function uploadImage({ cookieHeader, bytes, mimeType }) {
  const extension = String(mimeType || 'image/png').includes('jpeg') ? 'jpg' : 'png';
  const file = { field: 'img', filename: `orbitpress-${Date.now()}.${extension}`, mimeType, bytes };
  let lastError = 'no host tried';
  for (const host of hosts()) {
    const { body, contentType } = multipart({ source_url: '/' }, file);
    try {
      const text = await requestText(`${host}/upload-image/`, 'POST', {
        'User-Agent': UA,
        Accept: 'application/json, text/javascript, */*; q=0.01',
        'X-Requested-With': 'XMLHttpRequest',
        'X-CSRFToken': csrfFrom(cookieHeader),
        Cookie: cookieHeader,
        'Content-Type': contentType,
      }, body, { timeoutMs: 90000 });
      probe('upload', { host, status: 200, body: String(text).slice(0, 1200) });
      let parsed = null;
      try { parsed = JSON.parse(text); } catch { /* not json */ }
      const url = parsed && (parsed.image_url || (parsed.data && parsed.data.image_url) || parsed.url);
      if (url) return { ok: true, imageUrl: url };
      lastError = `unexpected upload response: ${String(text).slice(0, 160)}`;
    } catch (error) {
      lastError = `${error.status || ''} ${String(error.message).slice(0, 160)}`;
      probe('upload', { host, status: error.status || 0, error: String(error.message).slice(0, 400) });
    }
  }
  return { ok: false, message: lastError };
}

/** Step 2: create the pin. */
async function createPin({ cookieHeader, boardId, title, description, link, imageUrl, altText }) {
  const options = {
    board_id: boardId,
    title: String(title || '').slice(0, 100),
    description: String(description || '').slice(0, 800),
    link: String(link || ''),
    image_url: imageUrl,
    alt_text: String(altText || title || '').slice(0, 500),
    method: 'uploaded',
  };
  let lastError = 'no host tried';
  for (const host of hosts()) {
    for (const mode of ['body', 'query']) {
      const url = mode === 'query'
        ? `${host}/resource/PinResource/create/?source_url=/&data=${encodeURIComponent(JSON.stringify({ options, context: {} }))}`
        : `${host}/resource/PinResource/create/?source_url=/`;
      const headers = {
        'User-Agent': UA,
        Accept: 'application/json, text/javascript, */*; q=0.01',
        'X-Requested-With': 'XMLHttpRequest',
        'X-CSRFToken': csrfFrom(cookieHeader),
        'X-Pinterest-AppState': 'active',
        Cookie: cookieHeader,
        'Content-Type': mode === 'body' ? 'application/x-www-form-urlencoded' : undefined,
      };
      const body = mode === 'body'
        ? Buffer.from(`data=${encodeURIComponent(JSON.stringify({ options, context: {} }))}`)
        : null;
      try {
        const text = await requestText(url, 'POST', headers, body, { timeoutMs: 60000 });
        probe('create', { host, mode, status: 200, body: String(text).slice(0, 1500) });
        let parsed = null;
        try { parsed = JSON.parse(text); } catch { /* not json */ }
        const data = parsed && parsed.resource_response && parsed.resource_response.data;
        const id = data && (data.id || (data[0] && data[0].id));
        if (id) return { ok: true, pinId: String(id), pinUrl: `https://www.pinterest.com/pin/${id}/` };
        lastError = `unexpected create response: ${String(text).slice(0, 200)}`;
      } catch (error) {
        lastError = `${error.status || ''} ${String(error.message).slice(0, 160)}`;
        probe('create', { host, mode, status: error.status || 0, error: String(error.message).slice(0, 400) });
      }
    }
  }
  return { ok: false, message: lastError };
}

/** Accepts a numeric board id or a board URL and resolves it to an id. */
async function resolveBoardId(cookieHeader, value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (/^\d+$/.test(raw)) return raw;
  const match = raw.match(/pinterest\.com\/([^/]+)\/([^/?#]+)/);
  if (!match) return null;
  const boardUrl = `/${match[1]}/${match[2]}/`;
  for (const host of hosts()) {
    try {
      const text = await requestText(`${host}/resource/BoardResource/get/?source_url=${encodeURIComponent(boardUrl)}&data=${encodeURIComponent(JSON.stringify({ options: { board_url: boardUrl }, context: {} }))}`, 'GET', {
        'User-Agent': UA,
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        Cookie: cookieHeader,
      }, null, { timeoutMs: 30000 });
      const parsed = JSON.parse(text);
      const id = parsed && parsed.resource_response && parsed.resource_response.data && parsed.resource_response.data.id;
      if (id) return String(id);
    } catch { /* try the next host */ }
  }
  return null;
}

/**
 * Publish a pin with the signed-in session.
 * Returns { ok, pinUrl, pinId } or { ok:false, message, stage }.
 */
async function publishPinWithSession({ boardId, title, description, link, image, altText }) {
  const sessions = require('./sessions');
  const cookieHeader = await sessions.cookieHeader('pinterest').catch(() => '');
  if (!cookieHeader) return { ok: false, stage: 'session', message: 'لا توجد جلسة Pinterest متصلة — اربط الحساب من الإعدادات أولاً.' };
  if (!boardId) return { ok: false, stage: 'board', message: 'حدّد لوحة النشر (Board ID أو رابط اللوحة) في الإعدادات.' };
  const resolved = await resolveBoardId(cookieHeader, boardId);
  if (!resolved) return { ok: false, stage: 'board', message: `تعذّر العثور على اللوحة: ${boardId}` };

  const uploaded = await uploadImage({ cookieHeader, bytes: image.bytes, mimeType: image.mimeType });
  if (!uploaded.ok) return { ok: false, stage: 'upload', message: uploaded.message };
  const created = await createPin({
    cookieHeader,
    boardId: resolved,
    title,
    description,
    link,
    imageUrl: uploaded.imageUrl,
    altText,
  });
  if (!created.ok) return { ok: false, stage: 'create', message: created.message };
  return { ok: true, pinId: created.pinId, pinUrl: created.pinUrl };
}

module.exports = { publishPinWithSession, resolveBoardId, uploadImage, createPin, csrfFrom };
