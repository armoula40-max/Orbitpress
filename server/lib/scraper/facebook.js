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
  const SUFFIXES = { k: 1e3, 'ألف': 1e3, 'الالف': 1e3, 'الآف': 1e3, m: 1e6, 'مليون': 1e6, b: 1e9, 'مليار': 1e9 };
  const normDigits = v => String(v || '').replace(/[\u0660-\u0669]/g, d => String('\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669'.indexOf(d))).replace(/\u066b/g, '.').replace(/\u066c/g, '');
  const toNumber = value => {
    const s = normDigits(value);
    if (!s) return null;
    const suffixed = s.match(/(\\d[\\d,.]*?)\\s*(ألف|الالف|الآف|مليون|مليار|[kmb])(?![a-zA-Z\u0600-\u06FF])/i);
    if (suffixed) {
      const base = parseFloat(suffixed[1].replace(/,(?=\\d{3}(?:\\D|$))/g, ''));
      return Number.isNaN(base) ? null : Math.round(base * (SUFFIXES[suffixed[2].toLowerCase()] || 1));
    }
    const plain = s.replace(/[,\s]/g, '').match(/\\d+/);
    return plain ? Math.round(parseFloat(plain[0], 10)) : null;
  };
  // relative timestamps ("3 h", "12 mins", "Yesterday", "2 days") -> ISO
  const relativeToIso = (label) => {
    const t = String(label || '').toLowerCase().trim();
    if (!t) return null;
    if (/^just now/.test(t)) return new Date().toISOString();
    if (/^yesterday/.test(t)) return new Date(Date.now() - 864e5).toISOString();
    if (/الآن|قبل قليل/.test(t) || /^(منذ\s*)?الآن/.test(t)) return new Date().toISOString();
    if (/أمس|امس/.test(t)) return new Date(Date.now() - 864e5).toISOString();
    if (/منذ|^قبل/.test(t)) {
      const am = normDigits(t).match(/(\\d+)\\s*(ثانية|ثواني?|دقيقة|دقائق|ساعة|ساعات|يوم|أيام|ايام|أسبوع|اسبوع|أسابيع|اسابيع|شهر|شهور|أشهر)/);
      if (am) {
        const nA = parseInt(am[1], 10);
        const msA = /ثان|ثوان/.test(am[2]) ? 1e3 : /دقيقة|دقائق/.test(am[2]) ? 6e4 : /ساعة|ساعات/.test(am[2]) ? 36e5 : /يوم|أيام|ايام/.test(am[2]) ? 864e5 : /أسبوع|اسبوع|أسابيع|اسابيع/.test(am[2]) ? 6048e5 : 2592e6;
        return new Date(Date.now() - nA * msA).toISOString();
      }
    }
    const m = t.match(/^(\\d+)\\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days|w|week|weeks)\\b/);
    if (!m) return null;
    const n = parseInt(m[1], 10);
    const unit = m[2][0];
    const ms = unit === 'm' ? 6e4 : unit === 'h' ? 36e5 : unit === 'd' ? 864e5 : 6048e5;
    return new Date(Date.now() - n * ms).toISOString();
  };
  const posts = [];
  const seen = new Set();
  document.querySelectorAll('[role="article"],div[data-pagelet*="FeedUnit"],div[aria-posinset]').forEach(node => {
    // never treat nested cards (expanded comments are role=article too) as posts —
    // they polluted titles and stole metrics from the parent post
    if (node.parentElement && node.parentElement.closest('[role="article"],div[data-pagelet*="FeedUnit"],div[aria-posinset]')) return;
    const text = clean(node.innerText || node.textContent);
    const hasMedia = !!node.querySelector('img[src], video, [data-video-id]');
    if (text.length < 10 || (text.length < 25 && !hasMedia)) return;
    const anchors = Array.from(node.querySelectorAll('a[href]'));
    const permalink = anchors.find(a => /\\/(posts|permalink\\.php|videos|photos|photo|reel|share\\/p|share\\/v)\\b/.test(a.href) || /(story_fbid=|photo_id=|video_id=)/.test(a.href) || /story\\.php/.test(a.href));
    const heading = node.querySelector('h2,h3,h4,[role="heading"]');
    const authorAnchor = node.querySelector('h2 a, h3 a, h4 a, strong a, a[role="link"]');
    const authorName = authorAnchor ? clean(authorAnchor.innerText) : null;
    const lines = (node.innerText || '').split('\\n').map(s => s.trim()).filter(Boolean);
    let title = clean((heading && heading.innerText) || lines[0] || text);
    // Feed-style cards head with the author name — prefer the first real
    // sentence of the post body for a FeedSpy-style readable title.
    if (authorName && (title === authorName)) {
      title = clean(lines.find(l => l && l !== authorName && !/^(just now|yesterday|\\d+\\s*(m|mins?|h|hrs?|hours?|d|days?|w|weeks?)\\b)/i.test(l)) || lines[1] || text);
    }
    const url = permalink ? permalink.href.split('?')[0].endsWith('/') ? permalink.href : permalink.href : null;
    if (!title) title = url ? 'Facebook post' : 'Facebook media post';
    let publishedAt = null;
    const timeEl = node.querySelector('abbr[data-utime]');
    if (timeEl && timeEl.getAttribute('data-utime')) {
      publishedAt = new Date(Number(timeEl.getAttribute('data-utime')) * 1000).toISOString();
    } else {
      const timeLink = anchors.find(a => /^(just now|yesterday|منذ|قبل|أمس|امس|الآن|\\d+\\s*(m|min|mins|minutes?|h|hrs?|hours?|d|days?|w|weeks?)|[A-Z][a-z]+ \\d+)/i.test((a.innerText || a.getAttribute('aria-label') || '').trim()));
      if (timeLink) publishedAt = relativeToIso((timeLink.innerText || timeLink.getAttribute('aria-label') || '').trim());
    }
    let reactions = null, comments = null, shares = null;
    const RE_REACT = /(reaction|like|أعج|إعجاب|اعجاب|تفاعل)/i;
    const RE_COMMENT = /(comment|تعليق)/i;
    const RE_SHARE = /(share|مشارك)/i;
    const REACT_TYPES = /(أعج|أحبب|احبب|هاها|ههه|واو|أحزن|احزن|أغضب|اغضب|love|haha|wow|sad|angry|support|care)/i;
    // a line that is ONLY a count ("230", "1.2 ألف") — that is the reactions total
    const countToken = (l) => {
      const t = normDigits(l).trim();
      return /^\\d[\\d.,]*(?:\\s*(?:ألف|الالف|الآف|مليون|مليار|[kKmM]))?$/.test(t) ? toNumber(t) : null;
    };
    // Arabic aria labels often carry a PER-TYPE breakdown
    // ("أعجب 150، أحبب 60، واو 20") while the post shows the TOTAL — so sum.
    const sumReacts = (label) => {
      const s = normDigits(label);
      const cands = s.match(/\\d[\\d.,]*(?:\\s*(?:ألف|الالف|الآف|مليون|مليار|[kKmM]))?/g) || [];
      const nums = cands.map(toNumber).filter((v) => v != null);
      if (!nums.length) return null;
      if (nums.length > 1 && REACT_TYPES.test(s)) return nums.reduce((a, b) => a + b, 0);
      // "أعجبك أنت و229 آخرون" — your own reaction is not inside the number
      if (/(^|[\\s،])(أنت|you)([\\s،]|$)/i.test(s) && nums.length === 1) return nums[0] + 1;
      return nums[0];
    };
    // 1) stats row: reactions total is the bare-number line next to the comment/share line
    const statIdx = lines.findIndex((l) => (RE_COMMENT.test(l) || RE_SHARE.test(l)) && /[0-9٠-٩]/.test(l));
    if (statIdx >= 0) {
      lines.slice(statIdx, statIdx + 2).join(' · ').split(/[·|،ـ-]/).map((sg) => sg.trim()).filter(Boolean).forEach((seg) => {
        if (comments == null && RE_COMMENT.test(seg)) comments = sumReacts(seg);
        else if (shares == null && RE_SHARE.test(seg)) shares = sumReacts(seg);
        else if (reactions == null && RE_REACT.test(seg) && !/مشاهد|view/i.test(seg)) reactions = sumReacts(seg);
      });
      for (let k = Math.max(0, statIdx - 3); k <= statIdx + 1 && reactions == null; k += 1) {
        const v = countToken(lines[k]);
        if (v != null) reactions = v;
      }
    }
    // 2) aria-labels (bilingual; reaction breaks summed)
    Array.from(node.querySelectorAll('[aria-label]')).forEach((el) => {
      const label = el.getAttribute('aria-label') || '';
      if (!/[0-9٠-٩]/.test(label)) return;
      if (reactions == null && RE_REACT.test(label) && !RE_COMMENT.test(label)) reactions = sumReacts(label);
      if (comments == null && RE_COMMENT.test(label)) comments = sumReacts(label);
      if (shares == null && RE_SHARE.test(label) && !RE_COMMENT.test(label)) shares = sumReacts(label);
    });
    // 3) loose tail fallback (bilingual)
    const tail = lines.slice(-6).join(' ');
    if (comments == null) comments = toNumber((tail.match(/([\\d.,٬٫]+\s*(?:ألف|الالف|الآف|مليون|[kKmM])?)\\s+(?:comments?|تعليقات?)/i) || [])[1]);
    if (shares == null) shares = toNumber((tail.match(/([\\d.,٬٫]+\s*(?:ألف|الالف|الآف|مليون|[kKmM])?)\\s+(?:shares?|مشاركات?|مشاركة)/i) || [])[1]);
    if (reactions == null) reactions = toNumber((tail.match(/([\\d.,٬٫]+\s*(?:ألف|الالف|الآف|مليون|[kKmM])?)\\s+(?:likes?|reactions?|إعجاب|اعجاب|تفاعلات?|أشخاص)/i) || [])[1]);
    // 4) last resort: a lone bare-number line in the card (below the header)
    if (reactions == null) {
      const bare = [];
      lines.forEach((l, ix) => {
        const v = countToken(l);
        if (v != null && !/[:؛]/.test(l) && l.length <= 14) bare.push({ ix, v });
      });
      if (bare.length === 1 && bare[0].ix >= 2) reactions = bare[0].v;
    }
    const key = url || title.slice(0, 90);
    if (!key || seen.has(key)) return;
    seen.add(key);
    posts.push({
      title,
      text,
      url,
      publishedAt,
      author: authorAnchor ? clean(authorAnchor.innerText) : null,
      reactions, comments, shares, saves: null,
      image: (node.querySelector('img[src]') || {}).src || null,
      platform: 'facebook', kind: 'facebook_post', isComment: false,
    });
  });
  let pageName = null;
  const h1s = Array.from(document.querySelectorAll('h1'));
  for (const h of h1s) {
    const t = (h.innerText || '').trim();
    // skip Facebook's hidden accessibility <h1>Facebook</h1>
    if (t && !/^\\(?\\d*\\)?\\s*facebook$/i.test(t)) { pageName = t; break; }
  }
  if (!pageName) pageName = (document.title || '').replace(/^\\(\\d+\\)\\s*/, '').trim() || null;
  return { posts, pageName };
})()`;

// Cards hydrate lazily across scroll passes (text first, counters a moment
// later). Merge later observations INTO the first one: fill nulls and keep
// the freshest counters (reactions only grow while we scan).
function mergeObserved(existing, incoming) {
  for (const field of ['reactions', 'comments', 'shares', 'views']) {
    const a = existing[field];
    const b = incoming[field];
    if ((a == null || Number.isNaN(a)) && b != null) existing[field] = b;
    else if (a != null && b != null && Number(b) > Number(a)) existing[field] = Number(b);
  }
  if (!existing.publishedAt && incoming.publishedAt) existing.publishedAt = incoming.publishedAt;
  if (!existing.image && incoming.image) existing.image = incoming.image;
  if (!existing.url && incoming.url) existing.url = incoming.url;
  if ((!existing.title || /^Facebook (post|media post)$/.test(existing.title)) && incoming.title) existing.title = incoming.title;
  if ((!existing.text || existing.text.length < 40) && incoming.text && incoming.text.length > (existing.text || '').length) existing.text = incoming.text;
}

async function scanViaBrowser(sourceUrl, options) {
  const sessions = require('./sessions');
  const status = sessions.sessionStatus('facebook');
  const context = await sessions.getContext('facebook', { headless: true });
  const page = await context.newPage();
  try {
    await page.goto(sourceUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(4000);
    const scrollCap = Math.min(40, Math.max(1, options.scrolls || 20));
    const deadline = Date.now() + 170000;
    const windowStartMs = options.windowDays ? Date.now() - options.windowDays * 86400000 : null;
    const merged = new Map();
    let pageName = null;
    let stagnantPasses = 0;
    let lastSize = 0;
    let rawFound = 0;
    let stoppedBy = 'scroll-cap';
    let passesDone = 0;
    for (let pass = 0; pass < scrollCap && Date.now() < deadline; pass += 1) {
      passesDone = pass + 1;
      const batch = await page.evaluate(COLLECT_SCRIPT);
      rawFound += (batch.posts || []).length;
      if (batch.pageName && !pageName) pageName = batch.pageName;
      (batch.posts || []).forEach((post) => {
        if (!post) return;
        const urlKey = post.url || null;
        const titleKey = post.title ? String(post.title).slice(0, 90) : null;
        let entry = urlKey && merged.has(urlKey) ? merged.get(urlKey) : null;
        let entryKey = entry ? urlKey : null;
        if (!entry && titleKey && merged.has(titleKey)) { entry = merged.get(titleKey); entryKey = titleKey; }
        if (entry) {
          mergeObserved(entry, post);
          // a photo post may first be seen without a permalink, then with one —
          // re-key instead of duplicating the row
          if (urlKey && entryKey !== urlKey) {
            merged.delete(entryKey);
            entry.url = entry.url || urlKey;
            merged.set(urlKey, entry);
          }
        } else if (merged.size < options.maxPosts) {
          merged.set(urlKey || titleKey || `post-${merged.size}`, { ...post });
        }
      });
      stagnantPasses = merged.size > lastSize ? 0 : stagnantPasses + 1;
      lastSize = merged.size;
      if (merged.size >= options.maxPosts) { stoppedBy = 'post-cap'; break; }

      // Time-window coverage: stop as soon as we scrolled past the start of
      // the requested window (we then hold the full last-N-days chronology).
      if (windowStartMs) {
        const dated = [...merged.values()].map((p) => p.publishedAt && Date.parse(p.publishedAt)).filter(Boolean);
        if (dated.length >= 3 && Math.min(...dated) <= windowStartMs) { stoppedBy = 'window-covered'; break; } // covered: oldest seen is older than the window start
        if (dated.length >= 3 && stagnantPasses >= 4) { stoppedBy = 'no-older-posts'; break; }                  // page bottom reached, nothing older exists
      } else if (stagnantPasses >= 5) {
        stoppedBy = 'no-new-posts';
        break; // count-based mode with no new items
      }
      await page.evaluate('window.scrollBy(0, Math.max(900, Math.round(document.body.scrollHeight * 0.25)))');
      await page.waitForTimeout(1400);
    }
    if (Date.now() >= deadline && stoppedBy === 'scroll-cap') stoppedBy = 'time-limit';
    const dates = [...merged.values()].map((p) => p.publishedAt && Date.parse(p.publishedAt)).filter(Boolean);
    const coverage = dates.length
      ? { from: new Date(Math.min(...dates)).toISOString(), to: new Date(Math.max(...dates)).toISOString(), complete: !!(windowStartMs && Math.min(...dates) <= windowStartMs), windowDays: options.windowDays || null }
      : { from: null, to: null, complete: false, windowDays: options.windowDays || null };
    return { posts: [...merged.values()], sessionUsed: status.connected, pageName, coverage, browserDiag: { rawFound, unique: merged.size, passes: passesDone, stoppedBy } };
  } finally {
    await page.close().catch(() => {});
  }
}

const ORIGINAL_POST_RE = /(?:\/posts\/|\/permalink\.php|\/story\.php|\/photo\.php|\/videos?\/|\/reel\/|\/watch\/|\/share\/(?:p|v)\/|story_fbid=|photo_id=)/i;

// Browser-visible rows without a permalink are still real feed posts (FeedSpy
// shows them too); keep them when the text is substantial.
function keepPost(post) {
  if (post.url && ORIGINAL_POST_RE.test(post.url)) return true;
  // photo posts often carry no visible permalink and only a short caption
  return !post.url && (String(post.text || '').length >= 50 || !!post.image);
}

async function scanFacebook({ url, maxPosts = 25, scrolls, windowDays = 7, useSession = true, baseUrl }) {
  const base = (baseUrl || DEFAULT_BASE).replace(/\/+$/, '');
  let sourceUrl = String(url || '').trim();
  if (!sourceUrl) throw new Error('Enter a Facebook Page URL first.');
  const testMode = baseUrl && process.env.ORBITPRESS_ALLOW_HTTP === '1';
  classifyFacebookUrl(sourceUrl, { allowAnyHost: testMode });
  if (base !== DEFAULT_BASE) sourceUrl = sourceUrl.replace(DEFAULT_BASE, base);
  // window coverage mode wants a generous hard cap; the UI sends its own.
  const limit = Math.min(200, Math.max(1, Number(maxPosts) || 150));
  const days = Math.min(90, Math.max(1, Number(windowDays) || 7));
  const errors = [];
  let httpPosts = [];
  try {
    httpPosts = (await scanViaHttp(sourceUrl, { maxPosts: limit, useSession })).posts;
    httpPosts = httpPosts.filter(keepPost);
    if (httpPosts.length >= limit) {
      return finalize(httpPosts.slice(0, limit), sourceUrl, 'server_rendered_json', 'full');
    }
  } catch (error) {
    errors.push(`HTTP scan: ${error.message}`);
  }

  try {
    const result = await scanViaBrowser(sourceUrl, { maxPosts: limit, scrolls, windowDays: days });
    const merged = new Map(httpPosts.map((post) => [post.url || post.title, post]));
    result.posts
      .filter(keepPost)
      .forEach((post) => {
        const key = post.url || post.title;
        const prev = merged.get(key);
        if (!prev && merged.size < limit) merged.set(key, post);
        else if (prev) mergeObserved(prev, post); // fill image / nulls; freshest counter wins
      });
    const posts = [...merged.values()];
    if (posts.length) {
      const pipeline = { http: httpPosts.length, browserUnique: result.browserDiag ? result.browserDiag.unique : 0, browserRaw: result.browserDiag ? result.browserDiag.rawFound : 0, passes: result.browserDiag ? result.browserDiag.passes : 0, stoppedBy: result.browserDiag ? result.browserDiag.stoppedBy : null, final: Math.min(posts.length, limit) };
      return finalize(posts.slice(0, limit), sourceUrl, (httpPosts.length ? 'server_rendered_json+' : '') + 'server_browser' + (result.sessionUsed ? '+session' : ''), posts.length >= limit ? 'full' : 'partial', result.pageName, result.coverage, pipeline);
    }
  } catch (error) {
    errors.push(`Browser scan: ${error.message}`);
  }

  if (httpPosts.length) {
    const pipeline = { http: httpPosts.length, browserUnique: 0, browserRaw: 0, passes: 0, stoppedBy: errors.length ? 'browser-failed' : null, final: Math.min(httpPosts.length, limit), error: errors.join(' | ').slice(0, 300) || null };
    return finalize(httpPosts.slice(0, limit), sourceUrl, 'server_rendered_json', 'partial', null, null, pipeline);
  }
  const needsLogin = !useSession || /login|cookie|captcha|checkpoint/i.test(errors.join(' '));
  throw new Error(`Facebook scan failed. ${needsLogin ? 'Facebook usually requires a connected account session from a datacenter server — connect Facebook in Settings, then retry. ' : ''}${errors.join(' | ')}`.trim());
}

function finalize(posts, sourceUrl, method, completeness, pageName, coverage, pipeline) {
  const ranked = analyzer.rankPosts(posts);
  let source = pageName || null;
  try {
    const info = classifyFacebookUrl(sourceUrl);
    source = source || info.vanity || info.pageId || new URL(sourceUrl).hostname;
  } catch { /* keep hostname */
    try { source = source || new URL(sourceUrl).hostname; } catch { /* fully degraded */ }
  }
  return {
    ok: true,
    platform: 'facebook',
    source,
    sourceUrl,
    collectionMethod: method,
    completeness,
    coverage: coverage || null,
    pipeline: pipeline || null,
    posts: ranked,
    stats: analyzer.computeStats(ranked),
  };
}

module.exports = { scanFacebook, classifyFacebookUrl, extractStoriesFromHtml };
