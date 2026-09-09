'use strict';
/**
 * pinterestResource.js — the calls Pinterest's own web app makes.
 *
 * The public HTML is stripped for datacenter clients (no title, description,
 * date or engagement). Pinterest's front-end, however, loads its grids through
 * internal JSON endpoints under /resource/<Name>/get/. We issue exactly those
 * calls from this server, using the session the user signed in with inside
 * OrbitPress. No third-party service, no API subscription: the capability
 * belongs to the deployment.
 *
 * Everything here is defensive: hosts and resource names are tried in order,
 * and when ORBITPRESS_PINTEREST_PROBE=1 every attempt is dumped to
 * data/debug/ so a blocked or renamed endpoint can be diagnosed from real
 * output instead of guesswork.
 */
const fs = require('fs');
const path = require('path');
const { requestText } = require('../http');
const { DATA_DIR } = require('../store');

// Hosts are tried in order; overridable so tests (and future mirrors) can
// point the same calls elsewhere without touching production behaviour.
const HOSTS = String(process.env.ORBITPRESS_PINTEREST_HOSTS || 'https://www.pinterest.com,https://in.pinterest.com')
  .split(',')
  .map((host) => host.trim())
  .filter(Boolean);
const APP_VERSION = '9b8c7a6';

const BASE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  Accept: 'application/json, text/javascript, */*; q=0.01',
  'Accept-Language': 'en-US,en;q=0.9',
  'X-Requested-With': 'XMLHttpRequest',
  'X-Pinterest-AppState': 'active',
  'X-APP-VERSION': APP_VERSION,
};

function cookieValue(cookieHeader, name) {
  const match = String(cookieHeader || '').split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : '';
}

/** /resource/<name>/get/ — returns { ok, status, json, text, host }. */
async function callResource(name, { host, sourceUrl, data, cookieHeader, timeoutMs = 30000 }) {
  const params = new URLSearchParams({
    source_url: sourceUrl,
    data: JSON.stringify({ options: data, context: {} }),
    _: String(Date.now()),
  });
  const url = `${host}/resource/${name}/get/?${params.toString()}`;
  const headers = {
    ...BASE_HEADERS,
    'X-Pinterest-PWS-Handler': `www${sourceUrl.replace(/\//g, '/')}.js`,
    'X-Pinterest-Source-Url': sourceUrl,
    Referer: `${host}${sourceUrl}`,
  };
  const csrf = cookieValue(cookieHeader, 'csrftoken');
  if (csrf) headers['X-CSRFToken'] = csrf;
  if (cookieHeader) headers.Cookie = cookieHeader;
  try {
    const text = await requestText(url, 'GET', headers, null, { timeoutMs });
    let json = null;
    try { json = JSON.parse(text); } catch { /* not JSON: blocked or HTML wall */ }
    logProbe(name, { host, url, status: 200, text, json });
    return { ok: Boolean(json), status: 200, json, text, host };
  } catch (error) {
    logProbe(name, { host, url, status: error.status || 0, error: error.message });
    return { ok: false, status: error.status || 0, json: null, text: String((error && error.message) || ''), host, error };
  }
}

function logProbe(name, info) {
  if (process.env.ORBITPRESS_PINTEREST_PROBE !== '1') return;
  try {
    const dir = path.join(DATA_DIR, 'debug');
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const pins = info.json ? pinsFromResourceJson(info.json) : [];
    const sample = pins[0] || {};
    const lines = [
      `resource: ${name}`,
      `host: ${info.host}`,
      `status: ${info.status}`,
      `url: ${info.url}`,
      `bytes: ${String(info.text || '').length}`,
      `pins found: ${pins.length}`,
      `sample fields: ${Object.keys(sample).join(', ')}`,
      `sample: ${JSON.stringify(sample).slice(0, 800)}`,
      `error: ${info.error || '-'}`,
      `head: ${String(info.text || '').slice(0, 600)}`,
    ];
    fs.writeFileSync(path.join(dir, `pinterest-resource-${name}-${stamp}.txt`), lines.join('\n'));
  } catch { /* probing must never break a scan */ }
}

/**
 * Collect pins out of a resource response. Reuses the pin detector and the
 * normalizer from pinterest.js (title/description/created_at/images/engagement).
 */
function pinsFromResourceJson(json) {
  // Lazy require: pinterest.js requires this module.
  const { collectPinsFromJson } = require('./pinterest');
  const response = (json && json.resource_response) || (json && json.resource) || json;
  const data = response && response.data;
  const merged = new Map();
  const roots = Array.isArray(data) ? data : [data];
  for (const root of roots) {
    if (!root) continue;
    for (const pin of collectPinsFromJson(root, 100)) {
      if (pin.id && !merged.has(pin.id)) merged.set(pin.id, pin);
    }
  }
  return [...merged.values()];
}

function bookmarkOf(json) {
  const response = (json && json.resource_response) || {};
  const raw = response.bookmark;
  if (Array.isArray(raw)) return raw.filter(Boolean);
  if (typeof raw === 'string' && raw) return [raw];
  if (raw && typeof raw === 'object') return [raw];
  return [];
}

/** Try the same request across hosts until one returns pins. */
async function fetchFirst(name, { sourceUrl, data, cookieHeader, pageLimit = 3 }) {
  let bookmarks = [];
  const pins = [];
  let lastStatus = 0;
  for (let page = 0; page < pageLimit; page += 1) {
    let pagePins = [];
    let nextBookmarks = [];
    let responded = false;
    for (const host of HOSTS) {
      const options = { ...data };
      if (bookmarks.length) options.bookmarks = bookmarks;
      const result = await callResource(name, { host, sourceUrl, data: options, cookieHeader });
      lastStatus = result.status;
      if (!result.ok) continue;
      responded = true;
      pagePins = pinsFromResourceJson(result.json);
      nextBookmarks = bookmarkOf(result.json);
      if (pagePins.length || nextBookmarks.length) break;
    }
    if (!pagePins.length) break;
    pins.push(...pagePins);
    if (!nextBookmarks.length || !responded) break;
    bookmarks = nextBookmarks;
  }
  const seen = new Set();
  return pins.filter((pin) => (seen.has(pin.id) ? false : seen.add(pin.id)));
}

/** Public pins of a board: /user/board/ */
async function boardPins(user, board, { cookieHeader, maxItems = 20 } = {}) {
  const sourceUrl = `/${user}/${board}/`;
  const pins = await fetchFirst('BoardFeedResource', {
    sourceUrl,
    data: { board_id: '', board_url: sourceUrl, page_size: Math.max(25, Math.min(100, maxItems)), current_page: 0 },
    cookieHeader,
  });
  return pins.slice(0, maxItems);
}

/** Boards of a profile. */
async function profileBoards(user, { cookieHeader } = {}) {
  const sourceUrl = `/${user}/`;
  const json = await callResource('ProfileBoardsResource', {
    host: HOSTS[0],
    sourceUrl,
    data: { username: user, field_set_key: 'profile_grid', page_size: 50 },
    cookieHeader,
  });
  if (!json.ok) return [];
  const response = (json.json && json.json.resource_response) || {};
  const raw = Array.isArray(response.data) ? response.data : [];
  return raw.map((board) => ({
    id: String(board.id || ''),
    name: board.name || '',
    url: board.url || (board.slug ? `https://www.pinterest.com/${user}/${board.slug}/` : ''),
    pinCount: board.pin_count || null,
  })).filter((board) => board.url);
}

/** The profile's own created pins (/<user>/pins). */
async function profilePins(user, { cookieHeader, maxItems = 20 } = {}) {
  const sourceUrl = `/${user}/pins/`;
  const pins = await fetchFirst('UserPinsResource', {
    sourceUrl,
    data: { username: user, is_own_profile_pins: true, page_size: Math.max(25, Math.min(100, maxItems)) },
    cookieHeader,
  });
  if (pins.length) return pins.slice(0, maxItems);
  // Fallback: boards -> their pins (covers /_created for accounts whose
  // profile grid is walled while boards are still public).
  const boards = await profileBoards(user, { cookieHeader });
  const collected = [];
  for (const board of boards) {
    if (collected.length >= maxItems) break;
    const boardPinsList = await boardPins(user, boardSlugFromUrl(board.url, user), { cookieHeader, maxItems: maxItems - collected.length });
    collected.push(...boardPinsList);
  }
  return collected.slice(0, maxItems);
}

function boardSlugFromUrl(url, user) {
  const match = String(url).match(new RegExp(`pinterest\\.com/${user}/([^/]+)`));
  return match ? match[1] : '';
}

/** Keyword search across pins. */
async function searchPins(query, { cookieHeader, maxItems = 20 } = {}) {
  const sourceUrl = `/search/pins/?q=${encodeURIComponent(query)}`;
  const pins = await fetchFirst('BaseSearchResource', {
    sourceUrl,
    data: { query, scope: 'pins', page_size: Math.max(25, Math.min(100, maxItems)) },
    cookieHeader,
  });
  return pins.slice(0, maxItems);
}

/** Full pin detail (title, description, created_at, counts). */
async function pinDetail(pinId, { cookieHeader } = {}) {
  const sourceUrl = `/pin/${pinId}/`;
  const result = await callResource('PinResource', {
    host: HOSTS[0],
    sourceUrl,
    data: { id: pinId, field_set_key: 'detailed' },
    cookieHeader,
  });
  if (!result.ok) return null;
  const [pin] = pinsFromResourceJson(result.json);
  return pin || null;
}

module.exports = {
  callResource,
  pinsFromResourceJson,
  boardPins,
  profileBoards,
  profilePins,
  searchPins,
  pinDetail,
  cookieValue,
  HOSTS,
};
