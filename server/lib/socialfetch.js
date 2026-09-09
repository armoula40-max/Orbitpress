'use strict';
/**
 * socialfetch.js — optional external data provider (https://socialfetch.dev).
 *
 * DISABLED BY DEFAULT. It is only used when SOCIALFETCH_API_KEY is present in
 * the server environment; without it every scan keeps using the built-in
 * scraper and nothing here is contacted. That keeps the "no external API
 * unless you opt in" guarantee intact.
 *
 * Cost model (documented by the provider, 1 credit per successful request):
 *   - GET /v1/pinterest/search?query=           -> a page of pins (cheap)
 *   - GET /v1/pinterest/boards/pins?url=        -> a page of pins (cheap)
 *   - GET /v1/pinterest/profiles/{h}/boards     -> a page of boards
 *   - GET /v1/pinterest/pins?url=               -> ONE pin, WITH metrics
 * Search and board listings return no engagement numbers, so metrics are a
 * deliberate second pass over a limited number of pins (see METRICS_LIMIT).
 */
const { requestText } = require('./http');

const DEFAULT_BASE = 'https://api.socialfetch.dev';
const PIN_BASE = 'https://www.pinterest.com/pin';

function baseUrl() {
  return String(process.env.SOCIALFETCH_BASE_URL || DEFAULT_BASE).replace(/\/+$/, '');
}

function apiKey() {
  return String(process.env.SOCIALFETCH_API_KEY || '').trim();
}

function enabled() {
  return apiKey().length > 0;
}

function metricsLimit() {
  const raw = Number(process.env.SOCIALFETCH_METRICS_LIMIT);
  if (Number.isFinite(raw) && raw >= 0) return Math.min(100, Math.floor(raw));
  return 20; // default: at most 20 paid metric lookups per scan
}

/** Credits spent during the current process (surfaced in scan diagnostics). */
let creditsSpent = 0;
function spentCredits() {
  return creditsSpent;
}

async function call(path, params = {}) {
  const url = new URL(`${baseUrl()}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== '') url.searchParams.set(key, String(value));
  }
  let text;
  try {
    text = await requestText(url.toString(), 'GET', {
      'x-api-key': apiKey(),
      Accept: 'application/json',
    }, null, { timeoutMs: 45000 });
  } catch (error) {
    throw normalizeError(error);
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Social Fetch returned a response that is not JSON.');
  }
  const meta = parsed && parsed.meta ? parsed.meta : {};
  if (meta.creditsCharged != null) creditsSpent += Number(meta.creditsCharged) || 0;
  return parsed;
}

function normalizeError(error) {
  const message = String((error && error.message) || error);
  const status = error && error.status;
  if (status === 401) return new Error('مفتاح Social Fetch غير صالح (401). تحقق من SOCIALFETCH_API_KEY.');
  if (status === 402) return new Error('رصيد Social Fetch انتهى (402). أضف رصيداً، أو احذف المفتاح ليعود الزاحف المدمج.');
  if (status === 429) return new Error('Social Fetch: تجاوزت معدل الطلبات (429). أعد المحاولة بعد قليل.');
  if (status === 503) return new Error('Social Fetch: الخدمة غير متاحة مؤقتاً (503).');
  if (status === 400) return new Error(`Social Fetch رفض الطلب (400): ${message.slice(0, 160)}`);
  return new Error(`Social Fetch: ${message.slice(0, 200)}`);
}

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Map a provider pin (search and board shapes differ slightly) onto ours. */
function normalizePin(raw) {
  const images = raw.images || {};
  const imageUrl = (raw.image && raw.image.url)
    || (images.orig && images.orig.url)
    || (images.size736 && images.size736.url)
    || (images.size564 && images.size564.url)
    || (images.size474 && images.size474.url)
    || null;
  const metrics = raw.metrics || {};
  const id = String(raw.id || '');
  let publishedAt = null;
  if (raw.createdAt) {
    const parsed = new Date(raw.createdAt);
    if (!Number.isNaN(parsed.getTime())) publishedAt = parsed.toISOString();
  }
  return {
    id,
    platform: 'pinterest',
    kind: 'pinterest_pin',
    title: String(raw.title || '').slice(0, 300),
    text: String(raw.description || raw.altText || '').slice(0, 2000),
    publishedAt,
    url: raw.url || (id ? `${PIN_BASE}/${id}/` : null),
    outboundUrl: raw.link || raw.domain || null,
    imageUrl,
    saves: numberOrNull(metrics.saves != null ? metrics.saves : metrics.repins),
    comments: numberOrNull(metrics.comments),
    reactions: numberOrNull(metrics.reactions),
    shares: numberOrNull(metrics.shares),
    boardName: (raw.board && raw.board.name) || null,
    author: (raw.pinner && (raw.pinner.fullName || raw.pinner.username)) || null,
    topics: Array.isArray(raw.visualAnnotations) ? raw.visualAnnotations.slice(0, 12) : null,
  };
}

function pinsFromPayload(payload) {
  const data = payload && payload.data ? payload.data : {};
  const raw = Array.isArray(data.pins) ? data.pins : (data.pin ? [data.pin] : []);
  return raw.map(normalizePin).filter((pin) => pin.id);
}

function pageInfo(payload) {
  const page = (payload && payload.data && payload.data.page) || {};
  return { nextCursor: page.nextCursor || null, hasMore: page.hasMore === true };
}

/** GET /v1/pinterest/search — keyword discovery (no metrics). */
async function searchPins(query, { maxItems = 20, maxPages = 4 } = {}) {
  const pins = [];
  let cursor = null;
  for (let page = 0; page < maxPages; page += 1) {
    const payload = await call('/v1/pinterest/search', { query, cursor, trim: 'false' });
    pins.push(...pinsFromPayload(payload));
    const info = pageInfo(payload);
    if (!info.hasMore || !info.nextCursor || pins.length >= maxItems) break;
    cursor = info.nextCursor;
  }
  return pins.slice(0, maxItems);
}

/** GET /v1/pinterest/profiles/{handle}/boards */
async function listProfileBoards(handle, { maxPages = 2 } = {}) {
  const boards = [];
  let cursor = null;
  for (let page = 0; page < maxPages; page += 1) {
    const payload = await call(`/v1/pinterest/profiles/${encodeURIComponent(handle)}/boards`, { cursor });
    const data = (payload && payload.data) || {};
    if (Array.isArray(data.boards)) boards.push(...data.boards);
    const info = pageInfo(payload);
    if (!info.hasMore || !info.nextCursor) break;
    cursor = info.nextCursor;
  }
  return boards.filter((board) => board && board.url);
}

/** GET /v1/pinterest/boards/pins — one page can hold many pins (no metrics). */
async function listBoardPins(boardUrl, { maxItems = 20, maxPages = 3 } = {}) {
  const pins = [];
  let cursor = null;
  for (let page = 0; page < maxPages; page += 1) {
    const payload = await call('/v1/pinterest/boards/pins', { url: boardUrl, cursor, trim: 'false' });
    pins.push(...pinsFromPayload(payload));
    const info = pageInfo(payload);
    if (!info.hasMore || !info.nextCursor || pins.length >= maxItems) break;
    cursor = info.nextCursor;
  }
  return pins.slice(0, maxItems);
}

/** GET /v1/pinterest/pins — single pin, INCLUDES metrics (1 credit each). */
async function getPin(pinUrl) {
  const payload = await call('/v1/pinterest/pins', { url: pinUrl });
  const [pin] = pinsFromPayload(payload);
  return pin || null;
}

/**
 * Second pass: fill engagement numbers for the pins that matter most.
 * One credit per pin — bounded by metricsLimit() and silent on failure so a
 * metered outage never breaks a scan.
 */
async function enrichMetrics(pins, { limit } = {}) {
  const cap = Math.min(limit != null ? limit : metricsLimit(), pins.length);
  if (!cap) return 0;
  const targets = pins.slice(0, cap);
  let filled = 0;
  for (let i = 0; i < targets.length; i += 4) {
    const batch = targets.slice(i, i + 4);
    const results = await Promise.allSettled(batch.map((pin) => getPin(pin.url || `${PIN_BASE}/${pin.id}/`)));
    results.forEach((result, index) => {
      if (result.status !== 'fulfilled' || !result.value) return;
      const detail = result.value;
      const pin = batch[index];
      if (detail.saves != null) pin.saves = detail.saves;
      if (detail.comments != null) pin.comments = detail.comments;
      if (detail.reactions != null) pin.reactions = detail.reactions;
      if (detail.shares != null) pin.shares = detail.shares;
      if (detail.topics && detail.topics.length) pin.topics = detail.topics;
      filled += 1;
    });
  }
  return filled;
}

module.exports = {
  enabled,
  call,
  getPin,
  searchPins,
  listProfileBoards,
  listBoardPins,
  enrichMetrics,
  normalizePin,
  spentCredits,
  PIN_BASE,
};
