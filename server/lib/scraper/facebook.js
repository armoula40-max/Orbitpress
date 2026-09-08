'use strict';
/**
 * facebook.js — built-in Facebook Page scanner (hybrid).
 *
 * Strategy 1 (fast HTTP): fetch the page HTML (using the stored server-side
 *   session cookies when connected) and mine the embedded server-rendered JSON
 *   blobs for story units: message text, permalink, creation epoch, reaction /
 *   comment / share counts.
 *
 * Strategy 2 (browser fallback): scan visible posts in the server browser —
 *   the same DOM selectors the Android app used in its WebView scanner — with
 *   the connected session when available (login wall bypass for your own
 *   account sessions only; no CAPTCHA/2FA bypass).
 */
const { requestText } = require('../http');
const analyzer = require('./analyzer');

const DEFAULT_BASE = 'https://www.facebook.com';

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

function classifyFacebookUrl(url, { allowAnyHost = false } = {}) {
  let parsed;
  try {
    parsed = new URL(String(url || '').trim());
  } catch {
    throw new Error('Enter a valid https://facebook.com URL.');
  }
  const host = parsed.hostname.toLowerCase();
  if (!allowAnyHost && !(host === 'facebook.com' || host.endsWith('.facebook.com'))) {
    throw new Error('Only public Facebook HTTPS URLs are supported.');
  }
  const pageId = parsed.searchParams.get('id') || (parsed.pathname.match(/\/pages\/[^/]+\/(\d{5,})/) || [])[1] || null;
  const segments = parsed.pathname.split('/').filter(Boolean);
  return {
    pageId,
    path: parsed.pathname,
    vanity: segments[0] && !['p', 'pages', 'profile.php'].includes(segments[0]) ? segments[0] : null,
    segments,
  };
}

// ---------------------------------------------------------------------------
// HTTP mining of server-rendered JSON blobs
// ---------------------------------------------------------------------------

const POST_URL_RE = /https?:\/\/(?:www\.|m\.)?facebook\.com\/(?:[\w.]+\/(?:posts|videos|photos|reel)\/[\w.-]+|permalink\.php\?[^"']+|photo(?:\.php)?\?[^"']+)/;

function extractStoriesFromHtml(html) {
  const posts = new Map();
  // Facebook embeds story units as nested JSON in <script> tags ("creation_story", "post_id"...)
  const stories = html.match(/\{"__typename":"Story"[\s\S]*?\}\s*[,}\]]/g) || [];
  for (const chunk of stories) {
    try {
      const story = JSON.parse(chunk.replace(/[,}\]]\s*$/, (m) => m[0]));
      const post = normalizeStory(story);
      if (post && !posts.has(post.url)) posts.set(post.url, post);
    } catch { /* partial blob — skip */ }
  }
  // Generic fallback: any JSON object carrying postid+message pairs.
  if (!posts.size) {
    const generic = html.match(/\{[^{}]*"(?:post_id|story_id)":\s*"?\d{5,}"?[^{}]*"message"/g) || [];
    void generic;
  }
  return [...posts.values()];
}

function findDeep(node, predicate, limit = 40, found = [], depth = 0) {
  if (depth > limit || node == null || typeof node !== 'object') return found;
  if (predicate(node)) found.push(node);
  for (const value of Object.values(node)) {
    if (value && typeof value === 'object') findDeep(value, predicate, limit, found, depth + 1);
  }
  return found;
}

function firstText(node) {
  if (!node) return '';
  if (typeof node.text === 'string') return node.text;
  if (typeof node === 'string') return node;
  return '';
}

function normalizeStory(story) {
  try {
    const messageNodes = findDeep(story, (n) => n && typeof n === 'object' && typeof n.text === 'string' && (n.__typename === 'StoryMessage' || /text/i.test(n.__typename || '')));
    const message = messageNodes.map(firstText).join(' ').replace(/\s+/g, ' ').trim().slice(0, 2200);
    const feedback = findDeep(story, (n) => n && typeof n === 'object' && (n.feedback || n.feedbackId))[0];
    void feedback;
    const reactionNodes = findDeep(story, (n) => n && typeof n === 'object' && (n.reaction_count && (n.reaction_count.count != null) || n.reactions));
    let reactions = null;
    for (const n of reactionNodes) {
      const count = n.reaction_count && n.reaction_count.count;
      if (Number.isFinite(Number(count))) { reactions = Number(count); break; }
      const list = n.reactions;
      if (list && list.count != null) { reactions = Number(list.count); break; }
    }
    const commentNodes = findDeep(story, (n) => n && typeof n === 'object' && n.comment_list_title && n.comment_list_title.text);
    const shareNodes = findDeep(story, (n) => n && typeof n === 'object' && n.share_count && n.share_count.count != null);
    const urlNodes = findDeep(story, (n) => n && typeof n === 'object' && typeof n.url === 'string' && POST_URL_RE.test(n.url));
    const timeNode = findDeep(story, (n) => n && typeof n === 'object' && Number.isFinite(Number(n.creation_time)))[0];
    const url = urlNodes.length ? urlNodes[0].url : null;
    if (!url) return null;
    const comments = commentNodes.length ? Number((commentNodes[0].comment_list_title.text.match(/[\d,]+/) || [])[0]?.replace(/,/g, '')) : null;
    return {
      id: String(story.post_id || story.id || url),
      platform: 'facebook',
      kind: 'facebook_post',
      title: message.split('\n')[0].slice(0, 220) || 'Facebook post',
      text: message,
      url,
      publishedAt: timeNode ? new Date(Number(timeNode.creation_time) * 1000).toISOString() : null,
      reactions: Number.isFinite(reactions) ? reactions : null,
      comments: Number.isFinite(comments) ? comments : null,
      shares: shareNodes.length ? Number(shareNodes[0].share_count.count) : null,
      saves: null,
      viralScore: null,
    };
  } catch {
    return null;
  }
}

async function scanViaHttp(sourceUrl, options) {
  const sessions = require('./sessions');
  const cookieHeader = options.useSession === false ? '' : await sessions.cookieHeader('facebook').catch(() => '');
  const headers = { ...BROWSER_HEADERS };
  if (cookieHeader) headers.Cookie = cookieHeader;
  const html = await requestText(sourceUrl, 'GET', headers, null, { timeoutMs: 45000, allowHttp: sourceUrl.startsWith('http://') });
  return { posts: extractStoriesFromHtml(html).slice(0, options.maxPosts), html };
}

// ---------------------------------------------------------------------------
// Browser scan of visible posts (ported from SocialScanActivity)
// ---------------------------------------------------------------------------

const COLLECT_SCRIPT = `(() => {
  const clean = v => String(v || '').replace(/\\s+/g, ' ').trim().slice(0, 2200);
  const toNumber = value => {
    if (!value) return null;
    const match = String(value).replace(/,/g, '').match(/(\\d+(?:\\.\\d+)?)\\s*([kKmM])?/);
    if (!match) return null;
    let n = parseFloat(match[1]);
    if (match[2]) n *= match[2].toLowerCase() === 'k' ? 1000 : 1000000;
    return Math.round(n);
  };
  const posts = [];
  const seen = new Set();
  document.querySelectorAll('[role="article"],div[data-pagelet*="FeedUnit"]').forEach(node => {
    const anchors = Array.from(node.querySelectorAll('a[href]'));
    const permalink = anchors.find(a => /\\/(posts|permalink\\.php|videos|photos|reel)\\//.test(a.href) || /story_fbid=/.test(a.href));
    const text = clean(node.innerText || node.textContent);
    const firstHeading = node.querySelector('h2,h3,strong,span[dir="auto"]');
    const title = clean((firstHeading && firstHeading.innerText) || text.split('\\n')[0]);
    const url = permalink ? permalink.href : null;
    const timeEl = node.querySelector('abbr[data-utime]');
    let publishedAt = timeEl && timeEl.getAttribute('data-utime') ? new Date(Number(timeEl.getAttribute('data-utime')) * 1000).toISOString() : null;
    if (!publishedAt) {
      const badge = node.querySelector('a[aria-label][href*="/posts/"], a[aria-label][href*="story_fbid"]');
      if (badge && /ago|Yesterday|\\d{4}/.test(badge.getAttribute('aria-label') || '')) publishedAt = null;
    }
    let reactions = null, comments = null, shares = null;
    Array.from(node.querySelectorAll('[aria-label]')).forEach(el => {
      const label = el.getAttribute('aria-label') || '';
      if (reactions == null && /reaction|like/i.test(label)) reactions = toNumber(label);
      if (comments == null && /comment/i.test(label)) comments = toNumber(label);
      if (shares == null && /share/i.test(label)) shares = toNumber(label);
    });
    Array.from(node.querySelectorAll('span,div[role="button"]')).forEach(el => {
      const t = el.textContent || '';
      if (comments == null && /\\bcomment/i.test(t) && /\\d/.test(t) && t.length < 40) comments = toNumber(t);
      if (shares == null && /\\bshare/i.test(t) && /\\d/.test(t) && t.length < 40) shares = toNumber(t);
    });
    const key = url || title.slice(0, 80);
    if (!key || seen.has(key) || text.length < 12) return;
    seen.add(key);
    posts.push({ title, text, url, publishedAt, reactions, comments, shares, saves: null, platform: 'facebook', kind: 'facebook_post', isComment: false });
  });
  return posts;
})()`;

async function scanViaBrowser(sourceUrl, options) {
  const sessions = require('./sessions');
  const status = sessions.sessionStatus('facebook');
  const context = await sessions.getContext('facebook', { headless: true });
  const page = await context.newPage();
  try {
    await page.goto(sourceUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3200);
    const scrolls = Math.min(10, Math.max(1, options.scrolls || 6));
    const merged = new Map();
    for (let pass = 0; pass < scrolls; pass += 1) {
      const batch = await page.evaluate(COLLECT_SCRIPT);
      batch.forEach((post) => {
        const key = post.url || post.title;
        if (!merged.has(key) && merged.size < options.maxPosts) merged.set(key, post);
      });
      if (merged.size >= options.maxPosts) break;
      await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
      await page.waitForTimeout(850);
    }
    return { posts: [...merged.values()], sessionUsed: status.connected, pageTitle: await page.title() };
  } finally {
    await page.close().catch(() => {});
  }
}

const ORIGINAL_POST_RE = /(?:\/posts\/|\/permalink\.php|\/story\.php|\/photo\.php|\/videos?\/|\/reel\/|\/watch\/|\/share\/(?:p|v)\/|story_fbid=|photo_id=)/i;

async function scanFacebook({ url, maxPosts = 25, scrolls = 6, useSession = true, baseUrl }) {
  const base = (baseUrl || DEFAULT_BASE).replace(/\/+$/, '');
  let sourceUrl = String(url || '').trim();
  if (!sourceUrl) throw new Error('Enter a Facebook Page URL first.');
  const testMode = baseUrl && process.env.ORBITPRESS_ALLOW_HTTP === '1';
  classifyFacebookUrl(sourceUrl, { allowAnyHost: testMode });
  if (base !== DEFAULT_BASE) sourceUrl = sourceUrl.replace(DEFAULT_BASE, base);
  const limit = Math.min(200, Math.max(1, Number(maxPosts) || 25));
  const errors = [];
  let httpPosts = [];
  try {
    httpPosts = (await scanViaHttp(sourceUrl, { maxPosts: limit, useSession })).posts;
    httpPosts = httpPosts.filter((post) => post.url && ORIGINAL_POST_RE.test(post.url));
    if (httpPosts.length >= limit) {
      return finalize(httpPosts.slice(0, limit), sourceUrl, 'server_rendered_json', 'full');
    }
  } catch (error) {
    errors.push(`HTTP scan: ${error.message}`);
  }

  try {
    const result = await scanViaBrowser(sourceUrl, { maxPosts: limit, scrolls });
    const merged = new Map(httpPosts.map((post) => [post.url || post.title, post]));
    result.posts
      .filter((post) => post.url && ORIGINAL_POST_RE.test(post.url))
      .forEach((post) => { if (!merged.has(post.url) && merged.size < limit) merged.set(post.url, post); });
    const posts = [...merged.values()];
    if (posts.length) {
      return finalize(posts.slice(0, limit), sourceUrl, (httpPosts.length ? 'server_rendered_json+' : '') + 'server_browser' + (result.sessionUsed ? '+session' : ''), posts.length >= limit ? 'full' : 'partial', result.pageTitle);
    }
  } catch (error) {
    errors.push(`Browser scan: ${error.message}`);
  }

  if (httpPosts.length) {
    return finalize(httpPosts.slice(0, limit), sourceUrl, 'server_rendered_json', 'partial');
  }
  const needsLogin = !useSession || /login|cookie|captcha|checkpoint/i.test(errors.join(' '));
  throw new Error(`Facebook scan failed. ${needsLogin ? 'Facebook usually requires a connected account session from a datacenter server — connect Facebook in Settings, then retry. ' : ''}${errors.join(' | ')}`.trim());
}

function finalize(posts, sourceUrl, method, completeness, pageTitle) {
  const ranked = analyzer.rankPosts(posts);
  let source = pageTitle || null;
  try {
    const info = classifyFacebookUrl(sourceUrl);
    source = source || info.vanity || info.pageId || new URL(sourceUrl).hostname;
  } catch { /* keep hostname */ }
  return {
    ok: true,
    platform: 'facebook',
    source,
    sourceUrl,
    collectionMethod: method,
    completeness,
    posts: ranked,
    stats: analyzer.computeStats(ranked),
  };
}

module.exports = { scanFacebook, classifyFacebookUrl, extractStoriesFromHtml };
