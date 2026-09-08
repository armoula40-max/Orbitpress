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
  if (segments.length >= 2) return { kind: 'board', path, user: segments[0], board: segments[1] };
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

function looksLikePin(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (value.type === 'pin') return true;
  const hasMedia = value.images || value.image_xlarge_url || value.image_signature || value.carousel_data;
  const hasText = value.title != null || value.grid_title != null || value.description != null || value.rich_summary || value.closeup_description;
  return Number.isFinite(Number(value.id)) && String(value.id).length >= 6 && hasMedia && hasText;
}

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
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
    publishedAt: pin.created_at || pin.createdAt || null,
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
    return { pins: [...merged.values()], sessionUsed: status.connected };
  } finally {
    await page.close().catch(() => {});
  }
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
  let httpPins = [];
  try {
    const result = await scanViaHttp(sourceUrl, { maxItems: limit, useSession });
    httpPins = result.pins;
    if (httpPins.length >= limit) {
      return finalize(httpPins.slice(0, limit), source, sourceUrl, 'embedded_json', 'full');
    }
  } catch (error) {
    errors.push(`HTTP scan: ${error.message}`);
  }

  // Escalate to the server browser to top up (JS-rendered or session-gated feeds).
  try {
    const result = await scanViaBrowser(sourceUrl, { maxItems: limit, scrolls });
    const merged = new Map(httpPins.map((pin) => [pin.id, pin]));
    result.pins.forEach((pin) => {
      const existing = merged.get(pin.id);
      merged.set(pin.id, existing ? { ...pin, ...Object.fromEntries(Object.entries(existing).filter(([, v]) => v != null && v !== '')) } : pin);
    });
    const pins = [...merged.values()];
    if (pins.length) {
      return finalize(pins.slice(0, limit), source, sourceUrl, (httpPins.length ? 'embedded_json+' : '') + 'server_browser' + (result.sessionUsed ? '+session' : ''), pins.length >= limit ? 'full' : 'partial');
    }
  } catch (error) {
    errors.push(`Browser scan: ${error.message}`);
  }

  if (httpPins.length) {
    return finalize(httpPins.slice(0, limit), source, sourceUrl, 'embedded_json', 'partial');
  }
  const needsSession = /login|403|429|captcha|blocked|Could not/i.test(errors.join(' '));
  const message = `Pinterest scan failed. ${needsSession ? 'The platform is likely requiring a signed-in session from this server — connect Pinterest in Settings, then retry. ' : ''}${errors.join(' | ')}`.trim();
  throw new Error(message);
}

function finalize(pins, source, sourceUrl, method, completeness) {
  const ranked = analyzer.rankPosts(pins);
  return {
    ok: true,
    platform: 'pinterest',
    source: source.user ? `@${source.user}${source.board ? `/${source.board}` : ''}` : new URL(sourceUrl).hostname,
    sourceUrl,
    sourceKind: source.kind,
    collectionMethod: method,
    completeness,
    posts: ranked,
    stats: analyzer.computeStats(ranked),
  };
}

module.exports = { scanPinterest, classifySource, collectPinsFromJson, extractEmbeddedJson, normalizePin };
