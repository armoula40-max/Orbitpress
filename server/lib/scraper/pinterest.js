'use strict';
/**
 * pinterest.js — built-in Pinterest scanner (hybrid).
 *
 * Strategy 1 (fast HTTP): Pinterest embeds the initial feed as JSON in the
 *   page itself (<script id="__PWS_DATA__" type="application/json">). We fetch
 *   the profile / board / pin / search URL, extract that JSON and walk it for
 *   pin objects, including engagement (saves / repins / comments) when present.
 *
 * Strategy 2 (browser fallback): if the page requires JS/rendering or yielded
 *   fewer items than requested, we fall back to the server browser
 *   (Playwright, persistent session when connected) and scroll-collect.
 *
 * No Pinterest API keys, no cookie uploads — the scanner works anonymously for
 * public pages and uses your own server-side session only when you signed in
 * through Settings.
 */
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('../store');
const { requestText } = require('../http');
const analyzer = require('./analyzer');

const DEFAULT_BASE = 'https://www.pinterest.com';

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

function classifySource(url, { allowAnyHost = false } = {}) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Enter a valid https://www.pinterest.com URL.');
  }
  const host = parsed.hostname.toLowerCase();
  if (!allowAnyHost && !(host === 'pinterest.com' || host.endsWith('.pinterest.com'))) {
    throw new Error('Only public Pinterest HTTPS URLs are supported.');
  }
  const path = parsed.pathname.replace(/\/+$/, '');
  if (/\/pin\/\d+/.test(path)) return { kind: 'pin', path };
  if (/^\/search\//.test(path) || parsed.searchParams.get('q')) return { kind: 'search', path, query: parsed.searchParams.get('q') || '' };
  const segments = path.split('/').filter(Boolean);
  if (segments.length >= 2) {
    if (segments[1] === '_created' || segments[1] === '_saved') {
      return { kind: 'profile', path, user: segments[0], tab: segments[1].slice(1) };
    }
    return { kind: 'board', path, user: segments[0], board: segments[1] };
  }
  if (segments.length === 1) return { kind: 'profile', path, user: segments[0] };
  return { kind: 'home', path: '/' };
}

// ---------------------------------------------------------------------------
// JSON extraction & deep pin collection
// ---------------------------------------------------------------------------

function extractEmbeddedJson(html) {
  const roots = [];
  const scripts = String(html).match(/<script[^>]*type="application\/json"[^>]*>[\s\S]*?<\/script>/gi) || [];
  for (const tag of scripts) {
    const content = tag.replace(/^<script[^>]*>/i, '').replace(/<\/script>$/i, '');
    if (content.length < 200) continue;
    try {
      roots.push(JSON.parse(content));
    } catch { /* not a JSON island */ }
  }
  return roots;
}

const BOT_TOPIC_TITLE_RE = /discover pinterest'?s best ideas/i;
// Pinterest SEO boilerplate served for pins with no authored title/description.
// Never show it to the user as if it were their content.
const BOILERPLATE_RE = /discover \(and save!\) your own pins on pinterest|^this pin was discovered by|^pin on\s|^(pinterest|page not found|show[_ ]error)$/i;

function isBoilerplate(value) {
  return !value || BOILERPLATE_RE.test(String(value).trim());
}

function firstMatch(text, re) {
  const m = String(text || '').match(re);
  return m ? m[1] : null;
}

function extractBoardName(html) {
  return firstMatch(html, /"board"\s*:\s*\{[^}]{0,400}?"name"\s*:\s*"([^"]{1,120})"/)
    || firstMatch(html, /"board_name"\s*:\s*"([^"]{1,120})"/)
    || null;
}

// Ground truth: when a pin page looks empty we keep a small, readable dump so
// the next iteration can see exactly what Pinterest served (data/debug/).
const pinDebugWritten = new Set();
function writePinDebug(pinId, url, html, overlay) {
  if (pinDebugWritten.size >= 3) return;
  pinDebugWritten.add(pinId);
  try {
    const dir = path.join(DATA_DIR, 'debug');
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const base = path.join(dir, `pinterest-pin-${pinId}-${stamp}`);
    fs.writeFileSync(`${base}.url.txt`, `${url}\n`);
    fs.writeFileSync(`${base}.html`, String(html || '').slice(0, 400000));
    fs.writeFileSync(`${base}.summary.txt`, [
      `url: ${url}`,
      `bytes: ${String(html || '').length}`,
      `og:title: ${firstMatch(html, /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i) || '-'}`,
      `og:description: ${firstMatch(html, /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)/i) || '-'}`,
      `has created_at: ${/"created_at"\s*:/.test(html || '') ? 'yes' : 'no'}`,
      `has discovered-by boilerplate: ${/This Pin was discovered by/i.test(html || '') ? 'yes' : 'no'}`,
      `has bot-wall topic tiles: ${BOT_TOPIC_TITLE_RE.test(html || '') ? 'yes' : 'no'}`,
      `board name: ${extractBoardName(html) || '-'}`,
      `alt_text: ${firstMatch(html, /"alt_text"\s*:\s*"([^"]{3,200})"/) || '-'}`,
      `repin_count: ${firstMatch(html, /"repin_count"\s*:\s*(\d+)/) || '-'}`,
      `comment_count: ${firstMatch(html, /"comment_count"\s*:\s*(\d+)/) || '-'}`,
      `overlay applied: ${JSON.stringify(overlay)}`,
    ].join('\n'));
  } catch { /* debug dumps must never break a scan */ }
}

function looksLikePin(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const id = String(value.id != null ? value.id : '');
  if (!/^\d{15,}$/.test(id)) return false; // real Pin ids are 15+ digit snowflakes; topic/interest ids are short
  const title = String(value.title || value.grid_title || '');
  if (BOT_TOPIC_TITLE_RE.test(title)) return false; // bot-wall topic tile, not a pin
  if (value.type && value.type !== 'pin') return false;
  if (value.type === 'pin') return true;
  const hasMedia = value.images || value.image_xlarge_url || value.image_signature || value.carousel_data;
  const hasText = value.title != null || value.grid_title != null || value.description != null || value.rich_summary || value.closeup_description;
  return Boolean(hasMedia && hasText);
}

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Dates arrive in several shapes; keep one ISO form so sorting, CSV and the
 *  activity reports all agree. Unparseable values are preserved as-is. */
function normalizeDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  return String(value);
}

function normalizePin(pin) {
  const stats = ((pin.aggregated_pin_data || {}).aggregated_stats) || {};
  const saves = numberOrNull(stats.saves ?? stats.save ?? pin.save_count ?? pin.repin_count);
  const comments = numberOrNull(stats.comments ?? pin.comment_count);
  const reactions = numberOrNull((pin.reaction_counts || {})['1'] ?? stats.reactions ?? pin.like_count);
  const images = pin.images || {};
  const imageUrl = (images.orig && images.orig.url) || (images['736x'] && images['736x'].url) || (images['564x'] && images['564x'].url) || pin.image_xlarge_url || null;
  const id = String(pin.id);
  return {
    id,
    platform: 'pinterest',
    kind: 'pinterest_pin',
    title: String(pin.title || pin.grid_title || (pin.rich_summary && pin.rich_summary.display_name) || '').slice(0, 300),
    text: String(pin.description || pin.closeup_description || (pin.rich_summary && pin.rich_summary.display_description) || '').slice(0, 2000),
    publishedAt: normalizeDate(pin.created_at || pin.createdAt),
    url: `https://www.pinterest.com/pin/${id}/`,
    outboundUrl: pin.link || pin.domain || null,
    imageUrl,
    saves,
    comments,
    reactions,
    shares: null,
    viralScore: null,
    boardName: pin.board && (pin.board.name || null),
    author: pin.pinner && (pin.pinner.full_name || pin.pinner.username) || null,
  };
}

function collectPinsFromJson(root, limit, sink = new Map()) {
  const visit = (node, depth) => {
    if (sink.size >= limit || depth > 40 || node == null) return;
    if (Array.isArray(node)) {
      for (const item of node) {
        if (sink.size >= limit) return;
        visit(item, depth + 1);
      }
      return;
    }
    if (typeof node === 'object') {
      if (looksLikePin(node)) {
        const normalized = normalizePin(node);
        if (normalized.title || normalized.text || normalized.imageUrl) sink.set(normalized.id, normalized);
      }
      for (const value of Object.values(node)) {
        if (sink.size >= limit) return;
        if (value && typeof value === 'object') visit(value, depth + 1);
      }
    }
  };
  visit(root, 0);
  return [...sink.values()];
}

async function fetchSourceHtml(url, cookieHeader) {
  const headers = { ...BROWSER_HEADERS };
  if (cookieHeader) headers.Cookie = cookieHeader;
  return requestText(url, 'GET', headers, null, { timeoutMs: 45000, allowHttp: url.startsWith('http://') });
}

async function scanViaHttp(sourceUrl, options) {
  const sessions = require('./sessions');
  const cookieHeader = options.useSession === false ? '' : await sessions.cookieHeader('pinterest').catch(() => '');
  const html = await fetchSourceHtml(sourceUrl, cookieHeader);
  const roots = extractEmbeddedJson(html);
  const merged = new Map();
  for (const root of roots) {
    collectPinsFromJson(root, options.maxItems, merged);
    if (merged.size >= options.maxItems) break;
  }
  if (!merged.size) {
    const wall = /authwall|unauth|login|sign\s?up|captcha|Access Denied|robot/i.test(html) || html.length < 20000;
    throw new Error(wall
      ? 'Pinterest served a login/bot wall from this server IP (no pin data embedded) — connect your Pinterest account in Settings and retry'
      : 'No pins found in the served page (empty feed or changed markup)');
  }
  return { pins: [...merged.values()], html };
}

// ---------------------------------------------------------------------------
// Playwright fallback (scroll + report embedded JSON discovered in the DOM)
// ---------------------------------------------------------------------------

const COLLECT_SCRIPT = `(() => {
  const clean = v => String(v || '').replace(/\\s+/g, ' ').trim().slice(0, 2200);
  const pins = [];
  document.querySelectorAll('a[href*="/pin/"]').forEach(anchor => {
    const match = anchor.href.match(/\\/pin\\/(\\d{6,})/);
    if (!match) return;
    const holder = anchor.closest('[data-test-id="pin"],[data-test-id="pinWrapper"],div') || anchor;
    const img = holder.querySelector('img');
    const title = clean((img && img.alt) || holder.getAttribute('aria-label') || anchor.innerText);
    let saves = null;
    const savesNode = holder.querySelector('[data-test-id="repin-count"],[aria-label*="save" i]');
    if (savesNode) {
      const num = parseFloat(savesNode.textContent.replace(/[^0-9.kmKM]/g, ''));
      if (Number.isFinite(num)) saves = Math.round(num);
    }
    pins.push({ id: match[1], title, text: clean(title), url: 'https://www.pinterest.com/pin/' + match[1] + '/', imageUrl: img ? img.currentSrc || img.src : null, saves, comments: null, reactions: null, publishedAt: null, platform: 'pinterest', kind: 'pinterest_pin' });
  });
  return pins;
})()`;

// Single-pin pages carry the full record (og:title, description, image,
// publish time, visible counters, __PWS_DATA__ detail resource) — the
// profile grid itself lazy-loads only bare anchors.
const PIN_DETAIL_SCRIPT = `(() => {
  const clean = v => String(v || '').replace(/\\s+/g, ' ').trim().slice(0, 2200);
  const expandNum = (raw) => {
    if (!raw) return null;
    const m = String(raw).replace(/,/g, '').match(/(\\d+(?:\\.\\d+)?)([kKmM])?/);
    if (!m) return null;
    let n = parseFloat(m[1]);
    if (m[2]) n *= m[2].toLowerCase() === 'k' ? 1000 : 1000000;
    return Math.round(n);
  };
  const meta = (sel) => { const el = document.querySelector(sel); return el ? (el.getAttribute('content') || el.textContent) : null; };
  const title = clean(meta('meta[property="og:title"]') || (document.querySelector('h1') || {}).innerText || '');
  const text = clean(meta('meta[property="og:description"]') || meta('meta[name="description"]') || '');
  const imageUrl = meta('meta[property="og:image"]') || null;
  let publishedAt = null;
  const timeEl = document.querySelector('time[datetime]');
  if (timeEl) publishedAt = timeEl.getAttribute('datetime');
  const body = ((document.body && document.body.innerText) || '').slice(0, 20000);
  const pick = (re) => { const m = body.match(re); return m ? expandNum(m[1]) : null; };
  const saves = pick(/([\\d.,]+[kKmM]?)\\s*(?:\S*\s){0,2}(?:pins?|saves?|repins?|حفظ|عمليات حفظ)/i);
  const comments = pick(/([\\d.,]+[kKmM]?)\\s*(?:\S*\s){0,2}(?:comments?|تعليقات?)/i);
  return { title, text, imageUrl, publishedAt, saves, comments };
})()`;

async function scanViaBrowser(sourceUrl, options) {
  const sessions = require('./sessions');
  const status = sessions.sessionStatus('pinterest');
  const context = await sessions.getContext('pinterest', { headless: true });
  const page = await context.newPage();
  try {
    await page.goto(sourceUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3500);
    if (!status.connected) {
      const wall = await page.evaluate(`(() => { const t = (document.body && document.body.innerText || '').slice(0, 5000); return /log\\s?in|sign\\s?up|تسجيل الدخول|إنشاء حساب/i.test(t) && !document.querySelector('a[href*="/pin/"]'); })()`).catch(() => false);
      if (wall) throw new Error('Pinterest shows a login wall to this server (datacenter IP) — connect your Pinterest account in Settings, then scan again');
    }
    const scrolls = Math.min(10, Math.max(1, options.scrolls || 6));
    const merged = new Map();
    for (let pass = 0; pass < scrolls; pass += 1) {
      const domPins = await page.evaluate(COLLECT_SCRIPT);
      domPins.forEach((pin) => { if (!merged.has(pin.id) && merged.size < options.maxItems) merged.set(pin.id, pin); });
      // The live page also carries the full embedded JSON — mine it for metrics.
      try {
        const json = await page.evaluate(`(() => { const tag = document.getElementById('__PWS_DATA__'); return tag ? tag.textContent : null; })()`);
        if (json) {
          const parsed = JSON.parse(json);
          collectPinsFromJson(parsed, options.maxItems).forEach((pin) => {
            const existing = merged.get(pin.id);
            merged.set(pin.id, existing ? { ...pin, ...Object.fromEntries(Object.entries(existing).filter(([, v]) => v != null && v !== '')) } : pin);
          });
        }
      } catch { /* embedded JSON unavailable — DOM-only metrics stay partial */ }
      if (merged.size >= options.maxItems) break;
      await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
      await page.waitForTimeout(900);
    }
    // Deep pin visits: the profile grid handed us bare anchors — open each
    // pin page (session attached) and overlay its real record.
    let detailsFetched = 0;
    if (options.includeDetails !== false && (!options.baseUrl || options.baseUrl === DEFAULT_BASE)) {
      const detailBudget = Date.now() + 90000;
      const detailCap = Math.min(10, options.maxItems);
      const origin = new URL(sourceUrl).origin;
      for (const id of [...merged.keys()]) {
        if (detailsFetched >= detailCap || Date.now() > detailBudget) break;
        const existing = merged.get(id);
        if (existing && existing.title && existing.title.trim() && existing.publishedAt) continue; // already rich
        try {
          await page.goto(`${origin}/pin/${id}/`, { waitUntil: 'domcontentloaded', timeout: 20000 });
          await page.waitForTimeout(1500);
          const detail = await page.evaluate(PIN_DETAIL_SCRIPT).catch(() => null);
          if (detail && detail.title && /\s\|\s*Pinterest$/.test(detail.title)) detail.title = detail.title.replace(/\s*\|\s*Pinterest\s*$/, '');
          let mine = null;
          try {
            const jsonText = await page.evaluate(`(() => { const t = document.getElementById('__PWS_DATA__'); return t ? t.textContent : null; })()`);
            if (jsonText) {
              const found = collectPinsFromJson(JSON.parse(jsonText), 40);
              mine = found.find((pin) => pin.id === id) || null;
            }
          } catch { /* detail JSON absent */ }
          const overlay = {};
          const choose = (a, b) => (a != null && a !== '' ? a : b);
          if (mine || detail) {
            overlay.title = choose(mine && mine.title, detail && detail.title) || null;
            overlay.text = choose(mine && mine.text, detail && detail.text) || null;
            overlay.imageUrl = choose(mine && mine.imageUrl, detail && detail.imageUrl) || null;
            overlay.publishedAt = choose(mine && mine.publishedAt, detail && detail.publishedAt) || null;
            overlay.saves = choose(mine && mine.saves, detail && detail.saves);
            overlay.comments = choose(mine && mine.comments, detail && detail.comments);
            overlay.reactions = choose(mine && mine.reactions, null);
            overlay.outboundUrl = (mine && mine.outboundUrl) || null;
            ['title', 'text', 'imageUrl', 'publishedAt', 'saves', 'comments', 'reactions', 'outboundUrl'].forEach((f) => { if (overlay[f] == null) delete overlay[f]; });
            if (Object.keys(overlay).length) {
              merged.set(id, { ...existing, ...overlay });
              detailsFetched += 1;
            }
          }
        } catch { /* individual pin page failed — keep going */ }
      }
      if (merged.size && !detailsFetched && options.includeDetails !== false) {
        await sessions.captureDebug('pinterest', page, 'details-all-empty').catch(() => {});
      }
    }
    if (!merged.size) {
      await sessions.captureDebug('pinterest', page, status.connected ? 'empty-with-session' : 'empty-no-session');
      throw new Error(`Browser returned 0 pins ${status.connected ? 'even WITH your saved session' : '(no session in use)'} — snapshot saved in data/debug/ on the server`);
    }
    return { pins: [...merged.values()], sessionUsed: status.connected, detailsFetched };
  } catch (error) {
    const sessions = require('./sessions');
    await sessions.captureDebug('pinterest', page, `error-${Date.now()}`).catch(() => {});
    throw new Error(`${error.message} — snapshot saved in data/debug/ on the server`);
  } finally {
    await page.close().catch(() => {});
  }
}

/**
 * Cheap raw-HTTP pass over the top pins missing titles: each pin's own page
 * server-renders og:title / og:description / og:image, <time datetime> and
 * the __PWS_DATA__ detail record — no rendering needed, no wall for pins.
 */
async function enrichPinsViaHttp(pins, { max = 12, useSession = true } = {}) {
  const sessions = require('./sessions');
  const cookieHeader = useSession === false ? '' : await sessions.cookieHeader('pinterest').catch(() => '');
  const targets = pins.filter((pin) => !pin.title || !pin.title.trim() || /^pin on\s/i.test(pin.title)).slice(0, max);
  const ua = { ...BROWSER_HEADERS };
  if (cookieHeader) ua.Cookie = cookieHeader;
  let enriched = 0;
  for (let i = 0; i < targets.length; i += 4) {
    await Promise.allSettled(targets.slice(i, i + 4).map(async (pin) => {
      try {
        const html = await fetchSourceHtml(`${DEFAULT_BASE}/pin/${pin.id}/`, cookieHeader);
        void ua;
        const overlay = {};
        const og = (prop) => {
          const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']og:${prop}["'][^>]+content=["']([^"']+)`, 'i'))
            || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']og:${prop}["']`, 'i'));
          return m ? m[1].replace(/&amp;/g, '&').replace(/&#x27;|&apos;/g, "'").replace(/&quot;/g, '"') : null;
        };
        let mine = null;
        const merged2 = new Map();
        for (const root of extractEmbeddedJson(html)) {
          collectPinsFromJson(root, 60, merged2);
          if (merged2.size >= 60) break;
        }
        mine = merged2.get(pin.id) || null;
        const ogTitle = og('title');
        const ogText = og('description');
        const boardName = (mine && mine.boardName) || extractBoardName(html);
        const altText = firstMatch(html, /"alt_text"\s*:\s*"([^"]{3,200})"/);
        // Title priority: authored grid title -> og:title -> board name.
        // Pinterest's "Pin on <board>" is an SEO fallback, not a headline.
        let titleClean = String((mine && mine.title) || ogTitle || '').replace(/\s*\|\s*Pinterest\s*$/, '').trim();
        if (isBoilerplate(titleClean)) {
          titleClean = boardName || (/^pin on\s+(.+)$/i.exec(String(ogTitle || '').trim()) || [])[1] || '';
        }
        if (titleClean && !isBoilerplate(titleClean)) overlay.title = String(titleClean).slice(0, 300);
        const textClean = !isBoilerplate(ogText) ? ogText : (altText || '');
        if (textClean) overlay.text = String(textClean).slice(0, 2000);
        else if (isBoilerplate(ogText)) overlay.text = '';
        if (boardName) overlay.boardName = boardName;
        if (mine && mine.saves == null) {
          const repins = firstMatch(html, /"repin_count"\s*:\s*(\d+)/);
          if (repins != null) overlay.saves = Number(repins);
        }
        if (mine && mine.comments == null) {
          const comments = firstMatch(html, /"comment_count"\s*:\s*(\d+)/);
          if (comments != null) overlay.comments = Number(comments);
        }
        const imageUrl = (mine && mine.imageUrl) || og('image');
        if (imageUrl) overlay.imageUrl = imageUrl;
        const publishedAt = (mine && mine.publishedAt)
          || (() => { const m = html.match(/<time[^>]+datetime=["']([^"']+)/i); return m ? m[1] : null; })()
          || (() => { const m = html.match(/"created_at"\s*:\s*"([^"]{10,40})"/); return m ? m[1] : null; })()
          || (() => { const m = html.match(/<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)/i); return m ? m[1] : null; })();
        if (publishedAt) overlay.publishedAt = publishedAt;
        if (mine && mine.saves != null) overlay.saves = mine.saves;
        if (mine && mine.comments != null) overlay.comments = mine.comments;
        if (mine && mine.reactions != null) overlay.reactions = mine.reactions;
        if (mine && mine.outboundUrl) overlay.outboundUrl = mine.outboundUrl;
        // Debug dumps are opt-in: each pin page is ~1 MB of HTML.
        if (!publishedAt && process.env.ORBITPRESS_DEBUG_PINS === '1') writePinDebug(pin.id, `${DEFAULT_BASE}/pin/${pin.id}/`, html, overlay);
        if (Object.keys(overlay).length) { Object.assign(pin, overlay); enriched += 1; }
      } catch { /* one pin page failed — leave it */ }
    }));
    if (targets.length > 8 && i === 0) await new Promise((r) => setTimeout(r, 400));
  }
  return enriched;
}

/**
 * Merge two pin lists: `preferred` supplies the values, `secondary` only fills
 * fields that are still empty (resource data is richer than the HTML islands).
 */
function mergePinLists(preferred, secondary) {
  const merged = new Map();
  for (const pin of preferred) merged.set(pin.id, { ...pin });
  for (const pin of secondary) {
    const existing = merged.get(pin.id);
    if (!existing) { merged.set(pin.id, { ...pin }); continue; }
    for (const [key, value] of Object.entries(pin)) {
      if (existing[key] == null || existing[key] === '') existing[key] = value;
    }
  }
  return [...merged.values()];
}

/**
 * In-house pass over the JSON endpoints Pinterest's own front-end calls.
 * Uses the server-side session when one is connected; anonymous resource calls
 * still work on some Pinterest hosts.
 */
async function scanViaResource(source, { limit, useSession }) {
  const sessions = require('./sessions');
  const resource = require('./pinterestResource');
  const cookieHeader = useSession === false ? '' : await sessions.cookieHeader('pinterest').catch(() => '');
  if (source.kind === 'search') {
    return resource.searchPins(source.query, { cookieHeader, maxItems: limit });
  }
  if (source.kind === 'board') {
    return resource.boardPins(source.user, source.board, { cookieHeader, maxItems: limit });
  }
  if (source.kind === 'profile' && source.user) {
    return resource.profilePins(source.user, { cookieHeader, maxItems: limit });
  }
  if (source.kind === 'pin') {
    const id = (String(source.path).match(/\/pin\/(\d+)/) || [])[1];
    const pin = id ? await resource.pinDetail(id, { cookieHeader }) : null;
    return pin ? [pin] : [];
  }
  return [];
}

/**
 * Scan a Pinterest source (profile / board / pin / search URL or raw query).
 */
async function scanPinterest({ url, query, maxItems = 20, scrolls = 6, useSession = true, baseUrl }) {
  const base = (baseUrl || DEFAULT_BASE).replace(/\/+$/, '');
  let sourceUrl = url;
  if (!sourceUrl && query) {
    sourceUrl = `${base}/search/pins/?q=${encodeURIComponent(query)}`;
  }
  if (!sourceUrl) throw new Error('Enter a Pinterest URL or a search keyword.');
  if (base !== DEFAULT_BASE) {
    sourceUrl = sourceUrl.replace(DEFAULT_BASE, base);
  }
  // Test-only: allow pointing the scanner at a localhost mock server.
  const testMode = base !== DEFAULT_BASE && process.env.ORBITPRESS_ALLOW_HTTP === '1';
  const source = classifySource(sourceUrl, { allowAnyHost: testMode });
  const limit = Math.min(200, Math.max(1, Number(maxItems) || 20));

  const errors = [];
  // In-house resource pass: same JSON calls the Pinterest front-end makes.
  let resourcePins = [];
  if (!testMode) {
    try {
      resourcePins = await scanViaResource(source, { limit, useSession });
    } catch (error) {
      errors.push(`Resource API: ${error.message}`);
    }
  }
  // Profile tab URLs (/_created, /_saved) are walled to datacenter crawlers;
  // the parent profile serves those same pins publicly (created-first).
  const httpUrl = source.kind === 'profile' && source.tab ? `${base}/${source.user}` : sourceUrl;
  let httpPins = [];
  try {
    const result = await scanViaHttp(httpUrl, { maxItems: limit, useSession });
    httpPins = result.pins;
    if (httpPins.length >= limit && source.kind !== 'profile') {
      const sliced = httpPins.slice(0, limit);
      const enriched = testMode ? 0 : await enrichPinsViaHttp(sliced, { max: 20, useSession }).catch(() => 0);
      return finalize(sliced, source, sourceUrl, (resourcePins.length ? 'resource_api+' : '') + (enriched ? `embedded_json+enriched${enriched}` : 'embedded_json'), 'full', { resource: resourcePins.length, http: httpPins.length, enriched });
    }
  } catch (error) {
    errors.push(`HTTP scan: ${error.message}`);
  }
  if (resourcePins.length) httpPins = mergePinLists(resourcePins, httpPins);

  // Escalate to the server browser to top up (JS-rendered or session-gated feeds).
  const browserTargets = [sourceUrl];
  if (source.kind === 'profile' && source.tab) browserTargets.push(`${base}/${source.user}`); // tab walled? parent = created grid
  for (const target of browserTargets) {
    const isFallback = target !== sourceUrl;
    try {
      const result = await scanViaBrowser(target, { maxItems: limit, scrolls, includeDetails: !testMode });
      const merged = new Map(httpPins.map((pin) => [pin.id, pin]));
      result.pins.forEach((pin) => {
        const existing = merged.get(pin.id);
        merged.set(pin.id, existing ? { ...pin, ...Object.fromEntries(Object.entries(existing).filter(([, v]) => v != null && v !== '')) } : pin);
      });
      const pins = [...merged.values()];
      if (pins.length) {
        const sliced = pins.slice(0, limit);
        const enriched = testMode ? 0 : await enrichPinsViaHttp(sliced, { max: 20, useSession }).catch(() => 0);
        const method = (resourcePins.length ? 'resource_api+' : '') + (httpPins.length ? 'embedded_json+' : '') + 'server_browser' + (result.sessionUsed ? '+session' : '') + (result.detailsFetched ? `+details${result.detailsFetched}` : '') + (enriched ? `+enriched${enriched}` : '') + (isFallback ? '+tab-fallback' : '');
        return finalize(sliced, source, sourceUrl, method, pins.length >= limit ? 'full' : 'partial', { resource: resourcePins.length, http: httpPins.length, browser: result.pins.length, details: result.detailsFetched || 0, enriched });
      }
    } catch (error) {
      errors.push(`Browser scan (${isFallback ? 'profile fallback' : 'tab url'}): ${error.message}`);
    }
  }

  if (httpPins.length) {
    const sliced = httpPins.slice(0, limit);
    const enriched = testMode ? 0 : await enrichPinsViaHttp(sliced, { max: 20, useSession }).catch(() => 0);
    return finalize(sliced, source, sourceUrl, (resourcePins.length ? 'resource_api+' : '') + (enriched ? `embedded_json+enriched${enriched}` : 'embedded_json'), 'partial', { resource: resourcePins.length, http: httpPins.length, enriched });
  }
  const needsSession = /login|403|429|captcha|blocked|Could not/i.test(errors.join(' '));
  const message = `Pinterest scan failed. ${needsSession ? 'The platform is likely requiring a signed-in session from this server — connect Pinterest in Settings, then retry. ' : ''}${errors.join(' | ')}`.trim();
  throw new Error(message);
}

function finalize(pins, source, sourceUrl, method, completeness, pipeline) {
  const ranked = analyzer.rankPosts(pins);
  return {
    ok: true,
    platform: 'pinterest',
    source: source.user ? `@${source.user}${source.board ? `/${source.board}` : ''}` : new URL(sourceUrl).hostname,
    sourceUrl,
    sourceKind: source.kind,
    collectionMethod: method,
    completeness,
    pipeline: pipeline || null,
    posts: ranked,
    stats: analyzer.computeStats(ranked),
  };
}

module.exports = { scanPinterest, classifySource, collectPinsFromJson, extractEmbeddedJson, normalizePin };
