'use strict';
/**
 * pinterestPublish.js — create a Pin with the account you signed in with.
 *
 * The official v5 API needs an access token most people never create (and a
 * freshly created developer app stays on "Trial access pending" where every
 * endpoint answers code 3), so the same session that already drives the
 * scanner is used here. No third-party service, no developer app.
 *
 * Pinterest's own web app uploads local images through a four-step flow:
 *   1. POST /resource/ApiResource/create/  -> register the upload
 *      (url /v3/media/uploads/register/batch/, media_type image-story-pin)
 *   2. POST the bytes to the presigned S3 form returned in step 1
 *   3. GET  /resource/VIPResource/get/     -> poll until the image signature
 *   4. POST /resource/PinResource/create/ -> create the pin with upload_id +
 *      image_signature (method "uploaded")
 * The legacy /upload-image/ + image_url flow is kept as a fallback for hosts
 * where the register call is unavailable.
 *
 * Pinterest keeps the `_pinterest_sess` cookie even after logout, so a stored
 * profile can look "connected" while every write answers code 2 ("Authentication
 * failed"). Those failures are mapped to one Arabic re-login instruction
 * instead of a raw 401.
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
const ORIGIN = 'https://www.pinterest.com';
const S3_FALLBACK = 'https://pinterest-media-upload.s3-accelerate.amazonaws.com/';

const SESSION_RELOGIN_MESSAGE = 'جلسة Pinterest المحفوظة ليست مسجَّلة الدخول فعلياً أو انتهت صلاحيتها (Pinterest يُبقي كوكي الجلسة موجوداً حتى بعد تسجيل الخروج، لذا قد تظهر البطاقة «متصل» بينما الرفض الأمني كود 2). الحل: من بطاقة «الحسابات المرتبطة — تسجيل دخول السيرفر» اضغط «قطع الاتصال» ثم «تسجيل الدخول» مجدداً، وأكمل رمز التحقق الذي يصلك بالبريد أو تطبيق المصادقة حتى تظهر صفحتك الرئيسية، ثم أعد النشر.';

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

/** A stage-tagged failure so the caller can map it to user-facing guidance. */
function stageError(stage, message, { auth = false } = {}) {
  const error = new Error(message);
  error.stage = stage;
  error.auth = auth;
  return error;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function multipart(fields, file) {
  const boundary = `----orbitpress${crypto.randomBytes(12).toString('hex')}`;
  const chunks = [];
  for (const [name, raw] of Object.entries(fields || {})) {
    const value = raw == null ? '' : (typeof raw === 'object' ? JSON.stringify(raw) : String(raw));
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

function commonHeaders(cookieHeader, extra = {}) {
  return {
    'User-Agent': UA,
    Accept: 'application/json, text/javascript, */*; q=0.01',
    'Accept-Language': 'en-US,en;q=0.9',
    'X-Requested-With': 'XMLHttpRequest',
    'X-CSRFToken': csrfFrom(cookieHeader),
    Referer: `${ORIGIN}/pin-builder/`,
    Origin: ORIGIN,
    Cookie: cookieHeader,
    ...extra,
  };
}

function resourceForm(options, sourceUrl = '/') {
  return `source_url=${encodeURIComponent(sourceUrl)}`
    + `&data=${encodeURIComponent(JSON.stringify({ options, context: {} }))}`
    + `&_=${Date.now()}`;
}

function resourceUrl(host, resource, query = '') {
  return `${host}/resource/${resource}${query ? `?${query}` : ''}`;
}

/** Parse Pinterest's internal envelope and spot its auth failures. */
function envelopeOf(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function looksLikeAuthFailure(status, text) {
  if (status === 401 || status === 403) return true;
  const parsed = envelopeOf(text);
  if (!parsed) return false;
  if (Number(parsed.code) === 2) return true;
  if (String(parsed.status) === 'failure' && /auth|log\s?in|logged|session|unauthor/i.test(String(parsed.message || ''))) return true;
  return false;
}

function detailOf(error, fallback) {
  const raw = String((error && (error.body || error.message)) || fallback || '').replace(/\s+/g, ' ').trim();
  return raw.slice(0, 220);
}

/**
 * POST to a /resource/<Name>/<action>/ endpoint, trying each mirror host.
 * Auth failures abort the host loop; other failures carry the last detail.
 */
async function postResource(hostsList, cookieHeader, resource, options, sourceUrl, { stage = 'create', timeoutMs = 60000 } = {}) {
  let lastDetail = 'no host answered';
  for (const host of hostsList) {
    try {
      const text = await requestText(
        resourceUrl(host, resource),
        'POST',
        commonHeaders(cookieHeader, {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Pinterest-AppState': 'active',
        }),
        Buffer.from(resourceForm(options, sourceUrl)),
        { timeoutMs },
      );
      const parsed = envelopeOf(text);
      if (looksLikeAuthFailure(200, text)) {
        throw stageError('session', `${SESSION_RELOGIN_MESSAGE} (${detailOf({ body: text }, 'authentication code 2')})`, { auth: true });
      }
      if (!parsed) throw stageError(stage, `رد غير مفهوم من Pinterest: ${String(text).slice(0, 160)}`);
      return parsed;
    } catch (error) {
      if (error.auth) throw error;
      if (looksLikeAuthFailure(error.status, error.body || error.message)) {
        throw stageError('session', `${SESSION_RELOGIN_MESSAGE} (${detailOf(error)})`, { auth: true });
      }
      lastDetail = detailOf(error, lastDetail);
      probe(stage, { host, resource, status: error.status || 0, error: lastDetail });
    }
  }
  throw stageError(stage, `تعذّر الاتصال بـ Pinterest (${resource}): ${lastDetail}`);
}

async function getResource(hostsList, cookieHeader, resource, options, sourceUrl, { stage = 'upload', timeoutMs = 60000 } = {}) {
  let lastDetail = 'no host answered';
  const query = `source_url=${encodeURIComponent(sourceUrl)}&data=${encodeURIComponent(JSON.stringify({ options, context: {} }))}&_=${Date.now()}`;
  for (const host of hostsList) {
    try {
      const text = await requestText(
        resourceUrl(host, resource, query),
        'GET',
        commonHeaders(cookieHeader, {
          'X-Pinterest-PWS-Handler': 'www/[username].js',
          'X-Pinterest-AppState': 'active',
        }),
        null,
        { timeoutMs },
      );
      const parsed = envelopeOf(text);
      if (looksLikeAuthFailure(200, text)) {
        throw stageError('session', `${SESSION_RELOGIN_MESSAGE} (${detailOf({ body: text }, 'authentication code 2')})`, { auth: true });
      }
      if (!parsed) throw stageError(stage, `رد غير مفهوم من Pinterest: ${String(text).slice(0, 160)}`);
      return parsed;
    } catch (error) {
      if (error.auth) throw error;
      if (looksLikeAuthFailure(error.status, error.body || error.message)) {
        throw stageError('session', `${SESSION_RELOGIN_MESSAGE} (${detailOf(error)})`, { auth: true });
      }
      lastDetail = detailOf(error, lastDetail);
      probe(stage, { host, resource, status: error.status || 0, error: lastDetail });
    }
  }
  throw stageError(stage, `تعذّر الاتصال بـ Pinterest (${resource}): ${lastDetail}`);
}

// --- current S3-based upload flow -------------------------------------------

/** Step 1: register an image upload, receive the presigned S3 form. */
async function registerImageUpload(hostsList, cookieHeader, clientId) {
  const options = {
    url: '/v3/media/uploads/register/batch/',
    data: { media_info_list: JSON.stringify([{ id: clientId, media_type: 'image-story-pin' }]) },
  };
  const parsed = await postResource(hostsList, cookieHeader, 'ApiResource/create/', options, '/pin-creation-tool/', { stage: 'upload' });
  const data = parsed && parsed.resource_response && parsed.resource_response.data;
  const entries = data && typeof data === 'object' ? Object.values(data) : [];
  const entry = entries.find((value) => value && typeof value === 'object'
    && (value.upload_parameters || value.s3_upload_data));
  if (!entry) {
    throw stageError('upload', `تعذّر تسجيل رفع الصورة لدى Pinterest: ${JSON.stringify(data).slice(0, 200)}`);
  }
  return {
    uploadUrl: entry.upload_url || (data && data.upload_url) || S3_FALLBACK,
    uploadId: String(entry.upload_id || (data && data.upload_id) || clientId),
    params: entry.upload_parameters || entry.s3_upload_data || {},
  };
}

/** Step 2: put the image bytes into the presigned S3 form. */
async function uploadToS3(registration, { bytes, mimeType, filename }) {
  const fields = {};
  for (const [key, value] of Object.entries(registration.params || {})) {
    if (key === 'file') continue;
    fields[key] = value;
  }
  const { body, contentType } = multipart(fields, { field: 'file', filename, mimeType, bytes });
  try {
    await requestText(registration.uploadUrl, 'POST', {
      'User-Agent': UA,
      Accept: '*/*',
      Origin: ORIGIN,
      Referer: `${ORIGIN}/`,
      'Content-Type': contentType,
      'Content-Length': String(body.length),
    }, body, { timeoutMs: 120000 });
  } catch (error) {
    throw stageError('upload', `رفض مخزن Pinterest استلام الصورة (${error.status || 'network'}): ${detailOf(error)}`);
  }
}

/** Step 3: wait until Pinterest processed the upload and hands back a signature. */
async function pollUploadSignature(hostsList, cookieHeader, uploadId) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (attempt > 0) await sleep(2000);
    const parsed = await getResource(
      hostsList, cookieHeader, 'VIPResource/get/',
      { upload_ids: [uploadId] }, '/pin-creation-tool/', { stage: 'upload' },
    );
    const data = parsed && parsed.resource_response && parsed.resource_response.data;
    const info = (data && (data[uploadId] || data[String(uploadId)])) || data;
    if (info && typeof info === 'object') {
      const signature = info.signature || info.video_signature;
      if (signature) return { signature, imageUrl: info.image_url || '' };
      if (/succeed|complete/i.test(String(info.status || '')) && info.image_url) {
        return { signature: info.image_url, imageUrl: info.image_url };
      }
    }
    probe('upload-poll', { uploadId, attempt, data: JSON.stringify(data || null).slice(0, 600) });
  }
  throw stageError('upload', 'لم يؤكّد Pinterest اكتمال معالجة الصورة خلال المهلة (40 ثانية). أعد المحاولة بعد قليل.');
}

/** Step 4: create the pin against the registered upload. */
async function createPinFromUpload(hostsList, cookieHeader, fields) {
  const options = {
    board_id: String(fields.boardId),
    title: String(fields.title || '').slice(0, 100),
    description: String(fields.description || '').slice(0, 800),
    link: String(fields.link || ''),
    alt_text: String(fields.altText || fields.title || '').slice(0, 500),
    section: null,
    upload_id: Number(fields.uploadId),
    image_signature: fields.signature,
    method: 'uploaded',
    scrape_metric: { source: 'www_url_scrape' },
  };
  const parsed = await postResource(hostsList, cookieHeader, 'PinResource/create/', options, '/pin-creation-tool/', { stage: 'create' });
  const data = parsed && parsed.resource_response && parsed.resource_response.data;
  const id = data && (data.id || (Array.isArray(data) && data[0] && data[0].id));
  if (!id) throw stageError('create', `لم يُرجع Pinterest معرّف الدبوس: ${JSON.stringify(data).slice(0, 200)}`);
  return { pinId: String(id), pinUrl: `https://www.pinterest.com/pin/${id}/` };
}

// --- legacy /upload-image/ flow (kept as a fallback) ------------------------

/** Legacy step 1: upload the image the way the old web app did. */
async function uploadImage({ cookieHeader, bytes, mimeType }) {
  const extension = String(mimeType || 'image/png').includes('jpeg') ? 'jpg' : 'png';
  const file = { field: 'img', filename: `orbitpress-${Date.now()}.${extension}`, mimeType, bytes };
  let lastError = 'no host tried';
  for (const host of hosts()) {
    const { body, contentType } = multipart({ source_url: '/' }, file);
    try {
      const text = await requestText(`${host}/upload-image/`, 'POST', commonHeaders(cookieHeader, {
        'Content-Type': contentType,
        'X-UPLOAD-SOURCE': 'pinner_uploader',
      }), body, { timeoutMs: 90000 });
      probe('upload-legacy', { host, status: 200, body: String(text).slice(0, 1200) });
      if (looksLikeAuthFailure(200, text)) {
        throw stageError('session', `${SESSION_RELOGIN_MESSAGE} (${detailOf({ body: text })})`, { auth: true });
      }
      let parsed = null;
      try { parsed = JSON.parse(text); } catch { /* not json */ }
      const url = parsed && (parsed.image_url || (parsed.data && parsed.data.image_url) || parsed.url);
      if (url) return { ok: true, imageUrl: url };
      lastError = `unexpected upload response: ${String(text).slice(0, 160)}`;
    } catch (error) {
      if (error.auth) throw error;
      if (looksLikeAuthFailure(error.status, error.body || error.message)) {
        throw stageError('session', `${SESSION_RELOGIN_MESSAGE} (${detailOf(error)})`, { auth: true });
      }
      lastError = detailOf(error, `unexpected upload response: ${lastError}`);
      probe('upload-legacy', { host, status: error.status || 0, error: String(error.message).slice(0, 400) });
    }
  }
  return { ok: false, message: lastError };
}

/** Legacy step 2: create the pin from an uploaded image URL. */
async function createPin({ cookieHeader, boardId, title, description, link, imageUrl, altText }) {
  const options = {
    board_id: String(boardId),
    image_url: imageUrl,
    description: String(description || '').slice(0, 800),
    link: link ? String(link) : imageUrl,
    scrape_metric: { source: 'www_url_scrape' },
    method: 'uploaded',
    title: String(title || '').slice(0, 100),
    alt_text: String(altText || title || '').slice(0, 500),
    section: null,
  };
  const sourceUrl = `/pin/find/?url=${encodeURIComponent(imageUrl)}`;
  let lastError = 'no host tried';
  for (const host of hosts()) {
    try {
      const text = await requestText(resourceUrl(host, 'PinResource/create/'), 'POST', commonHeaders(cookieHeader, {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Pinterest-AppState': 'active',
      }), Buffer.from(resourceForm(options, sourceUrl)), { timeoutMs: 60000 });
      probe('create-legacy', { host, status: 200, body: String(text).slice(0, 1500) });
      if (looksLikeAuthFailure(200, text)) {
        throw stageError('session', `${SESSION_RELOGIN_MESSAGE} (${detailOf({ body: text })})`, { auth: true });
      }
      let parsed = null;
      try { parsed = JSON.parse(text); } catch { /* not json */ }
      const data = parsed && parsed.resource_response && parsed.resource_response.data;
      const id = data && (data.id || (Array.isArray(data) && data[0] && data[0].id));
      if (id) return { ok: true, pinId: String(id), pinUrl: `https://www.pinterest.com/pin/${id}/` };
      lastError = `unexpected create response: ${String(text).slice(0, 200)}`;
    } catch (error) {
      if (error.auth) throw error;
      if (looksLikeAuthFailure(error.status, error.body || error.message)) {
        throw stageError('session', `${SESSION_RELOGIN_MESSAGE} (${detailOf(error)})`, { auth: true });
      }
      lastError = detailOf(error, lastError);
    }
  }
  return { ok: false, message: lastError };
}

/** Normalize a board name/slug for comparison (case/diacritic/dash tolerant). */
function boardKey(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .trim().replace(/^@/, '')
    .replace(/https?:\/\/(?:www\.)?pinterest\.com\//, '')
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9؀-ۿ\-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * List the connected account's own boards (what the "Save to" picker shows),
 * following Pinterest's bookmark pagination for up to three pages.
 * Returns { ok, boards, username } where each board has { id, name, url, slug }.
 */
async function listMyBoards(hostsList, cookieHeader, knownUsername = '') {
  const collected = [];
  const seen = new Set();
  let username = knownUsername || '';
  const absorb = (items) => {
    for (const b of items || []) {
      if (!b || (!b.id && !b.name)) continue;
      const owner = b.owner && b.owner.username;
      if (owner && !username) username = owner;
      const url = String(b.url || '');
      const id = b.id ? String(b.id) : '';
      const dedupeKey = id || url || b.name;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      collected.push({
        id,
        name: String(b.name || ''),
        url,
        slug: url ? url.replace(/^\/|\/$/g, '').split('/').pop() : '',
      });
    }
  };

  // Resource A: the pin builder's "save to" picker — session-scoped, no
  // username required. Resource B: the profile boards listing (proven shape
  // from the unofficial libraries), used with the canary's username.
  const plans = [
    {
      resource: 'BoardPickerBoardsResource/get/',
      sourceUrl: '/pin-builder/',
      options: (bookmark) => ({
        page_size: 50, sort: 'custom', privacy_filter: 'all',
        redux_normalize_feed: true, bookmarks: [bookmark],
      }),
    },
    {
      resource: 'BoardsResource/get/',
      sourceUrl: username ? `/${username}/boards/` : '/',
      options: (bookmark) => ({
        page_size: 50,
        privacy_filter: 'all',
        sort: 'custom',
        isPrefetch: false,
        include_archived: true,
        field_set_key: 'profile_grid_item',
        group_by: 'visibility',
        redux_normalize_feed: true,
        ...(username ? { username } : {}),
        bookmarks: [bookmark],
      }),
    },
  ];

  for (const plan of plans) {
    let bookmark = null;
    for (let pageNo = 0; pageNo < 2; pageNo += 1) {
      let parsed;
      try {
        parsed = await getResource(hostsList, cookieHeader, plan.resource,
          plan.options(bookmark), plan.sourceUrl, { stage: 'board', timeoutMs: 30000 });
      } catch (error) {
        if (error.auth) throw error;
        break;
      }
      const data = parsed && parsed.resource_response && parsed.resource_response.data;
      const items = Array.isArray(data) ? data
        : (data && Array.isArray(data.data) ? data.data : []);
      absorb(items);
      const next = parsed && parsed.resource && parsed.resource.options
        && parsed.resource.options.bookmarks && parsed.resource.options.bookmarks[0];
      if (!items.length || !next || next === '-end-') break;
      bookmark = next;
    }
    if (collected.length) break;
  }
  return { ok: collected.length > 0, boards: collected, username };
}

/**
 * Resolve whatever the user pasted (numeric id, board URL, "user/slug", slug
 * or board name) against Pinterest, falling back to the connected account's
 * board list so a typo or a different username is matched instead of failing.
 * Returns { id, matchedName? } or { boards, username, wanted }.
 */
async function resolveBoard(cookieHeader, value, knownUsername = '') {
  const raw = String(value || '').trim();
  const mirrors = hosts();
  if (/^\d+$/.test(raw)) return { id: raw };

  const urlMatch = raw.match(/pinterest\.com\/([^/]+)\/([^/?#]+)/);
  const slashMatch = !urlMatch && /^[\w.-]+\/[\w.-]+$/.test(raw) ? raw.match(/^([^/]+)\/([^/]+)$/) : null;
  const wantedUser = urlMatch ? urlMatch[1] : (slashMatch ? slashMatch[1] : '');
  const slugInUrl = urlMatch ? urlMatch[2] : (slashMatch ? slashMatch[2] : '');

  if (slugInUrl) {
    const boardUrl = `/${wantedUser}/${slugInUrl}/`;
    try {
      const parsed = await getResource(mirrors, cookieHeader, 'BoardResource/get/',
        { board_url: boardUrl }, boardUrl, { stage: 'board', timeoutMs: 30000 });
      const id = parsed && parsed.resource_response && parsed.resource_response.data
        && parsed.resource_response.data.id;
      if (id) return { id: String(id) };
    } catch (error) {
      if (error.auth) throw error;
    }
  }

  const listed = await listMyBoards(mirrors, cookieHeader, knownUsername)
    .catch(() => ({ ok: false, boards: [], username: '' }));
  const boards = listed.boards || [];
  const wantedKey = boardKey(slugInUrl || raw);

  const matches = (board) => {
    if (!wantedKey) return false;
    if (board.id && board.id === raw) return true;
    const keys = [board.slug, board.url, board.name].map(boardKey);
    if (slugInUrl) return keys.includes(boardKey(slugInUrl));
    return keys.includes(wantedKey);
  };
  let hit = boards.find(matches);
  if (!hit && wantedKey.length > 3) {
    hit = boards.find((b) => {
      const nameKey = boardKey(b.name);
      return nameKey && (nameKey.includes(wantedKey) || wantedKey.includes(nameKey));
    });
  }
  if (hit && hit.id) return { id: hit.id, matchedName: hit.name };
  return { boards, username: listed.username, wanted: raw };
}

function formatBoardsList(boards) {
  return (boards || []).slice(0, 10).map((b) => {
    const link = b.url
      ? `https://www.pinterest.com${b.url.startsWith('/') ? '' : '/'}${b.url}`
      : `(معرّف ${b.id})`;
    return `• ${b.name || b.slug || b.id} — ${link}`;
  }).join('\n');
}

/**
 * Publish a pin with the signed-in session.
 * Returns { ok, pinUrl, pinId } or { ok:false, message, stage }.
 */
/**
 * Functional session canary: call UserResource/get the way the site's own
 * header does. Cookie names (`_auth`, …) are NOT reliable proof — some fully
 * logged-in accounts never receive `_auth=1` — whereas the authenticated user
 * resource either returns the account or auth code 2.
 */
/** Returns the signed-in username ('' if unknown) or throws an auth stage error. */
async function sessionAlive(hostsList, cookieHeader) {
  try {
    const parsed = await getResource(
      hostsList, cookieHeader, 'UserResource/get/',
      { isPrefetch: false, field_set_key: 'auth' }, '/', { stage: 'session', timeoutMs: 30000 },
    );
    const data = parsed && parsed.resource_response && parsed.resource_response.data;
    if (!(data && (data.username || data.id))) return null;
    return String(data.username || '');
  } catch (error) {
    if (error.auth) throw error;
    // A non-auth failure (network quirk on a mirror) must not block publishing:
    // the board resolution / upload right after will surface real problems.
    return '';
  }
}

async function publishPinWithSession({ boardId, title, description, link, image, altText }) {
  const sessions = require('./sessions');
  const cookieHeader = await sessions.cookieHeader('pinterest').catch(() => '');
  if (!cookieHeader) return { ok: false, stage: 'session', message: 'لا توجد جلسة Pinterest متصلة — اربط الحساب من الإعدادات أولاً.' };
  if (!/_pinterest_sess=/.test(cookieHeader)) {
    return { ok: false, stage: 'session', message: 'ملف جلسة Pinterest ناقص — اقطع الاتصال من البطاقة وسجّل الدخول مجدداً (أو استورد الكوكيز)، ثم أعد النشر.' };
  }
  if (!csrfFrom(cookieHeader)) {
    return { ok: false, stage: 'session', message: 'تنقص كوكي csrftoken في جلسة Pinterest — اقطع الاتصال من البطاقة وسجّل الدخول مجدداً حتى تكتمل الجلسة، ثم أعد النشر.' };
  }
  if (!boardId) return { ok: false, stage: 'board', message: 'حدّد لوحة النشر (Board ID أو رابط اللوحة) في الإعدادات.' };

  const mirrors = hosts();

  // Canary: prove the plain-HTTP session is actually logged in before we
  // register an upload (works for numeric board IDs too, which skip resolve),
  // and learn the connected username for the boards listing.
  let me = '';
  try {
    me = await sessionAlive(mirrors, cookieHeader);
    if (me === null) return { ok: false, stage: 'session', message: SESSION_RELOGIN_MESSAGE };
  } catch (error) {
    if (error.auth) return { ok: false, stage: 'session', message: error.message };
    me = '';
  }

  let resolution;
  try {
    resolution = await resolveBoard(cookieHeader, boardId, me);
  } catch (error) {
    if (error.auth) return { ok: false, stage: 'session', message: error.message };
    resolution = { boards: [], wanted: boardId };
  }
  if (!resolution.id) {
    let message = `تعذّر العثور على اللوحة: ${boardId}.`;
    if (resolution.matchedName) {
      // Should not happen (matched boards carry an id) — kept for safety.
      return { ok: false, stage: 'board', message };
    }
    if (resolution.boards && resolution.boards.length) {
      message += ` اللوحات التالية هي المملوكة للحساب المتصل — الصق رابط/اسم اللوحة الصحيح من بينها:\n${formatBoardsList(resolution.boards)}`;
    }  else {
      message += ' تأكد أن الحساب المتصل يملك هذه اللوحة وأنها لُوحظت أثناء الفتح (قد تحتاج لفتح pinterest.com في متصفح السيرفر مرة أو إنشائها). إن كان رابط اللوحة يحتوي اسم مستخدم مختلف عن الحساب المتصل، تكفي كتابة جزء اسم اللوحة أو معرّفها الرقمي.';
    }
    const ownerLine = resolution.username ? ` (الحساب المتصل: ${resolution.username})` : '';
    return { ok: false, stage: 'board', message: message + ownerLine };
  }

  const extension = String(image.mimeType || 'image/png').includes('jpeg') ? 'jpg' : 'png';
  const filename = `orbitpress-${Date.now()}.${extension}`;

  // Primary: the flow Pinterest's own pin builder uses today.
  try {
    const clientId = crypto.randomBytes(16).toString('hex');
    const registration = await registerImageUpload(mirrors, cookieHeader, clientId);
    probe('upload-register', { uploadUrl: registration.uploadUrl, uploadId: registration.uploadId });
    await uploadToS3(registration, { bytes: image.bytes, mimeType: image.mimeType, filename });
    const { signature } = await pollUploadSignature(mirrors, cookieHeader, registration.uploadId);
    const created = await createPinFromUpload(mirrors, cookieHeader, {
      boardId: resolution.id, uploadId: registration.uploadId, signature, title, description, link, altText,
    });
    return { ok: true, pinId: created.pinId, pinUrl: created.pinUrl };
  } catch (modernError) {
    if (modernError.auth) return { ok: false, stage: 'session', message: modernError.message };
    probe('modern-flow-failed', { stage: modernError.stage, message: String(modernError.message).slice(0, 400) });

    // Fallback: the older /upload-image/ + remote image_url create flow.
    try {
      const uploaded = await uploadImage({ cookieHeader, bytes: image.bytes, mimeType: image.mimeType });
      if (!uploaded.ok) throw stageError('upload', uploaded.message);
      const created = await createPin({
        cookieHeader,
        boardId: resolution.id,
        title,
        description,
        link,
        imageUrl: uploaded.imageUrl,
        altText,
      });
      if (!created.ok) throw stageError('create', created.message);
      return { ok: true, pinId: created.pinId, pinUrl: created.pinUrl };
    } catch (legacyError) {
      if (legacyError.auth) return { ok: false, stage: 'session', message: legacyError.message };
      const stage = modernError.stage || 'upload';
      return {
        ok: false,
        stage,
        message: `تعذّر رفع/إنشاء الدبوس لدى Pinterest (${stage}): ${String(modernError.message).slice(0, 300)}`.slice(0, 500),
      };
    }
  }
}

/** Backward-compatible wrapper: id string or null. */
async function resolveBoardId(cookieHeader, value) {
  const result = await resolveBoard(cookieHeader, value);
  return result.id || null;
}

module.exports = {
  publishPinWithSession,
  resolveBoard,
  resolveBoardId,
  listMyBoards,
  uploadImage,
  createPin,
  registerImageUpload,
  uploadToS3,
  pollUploadSignature,
  createPinFromUpload,
  boardKey,
  csrfFrom,
  SESSION_RELOGIN_MESSAGE,
};
