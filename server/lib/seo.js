'use strict';
/**
 * seo.js — professional on-page SEO pipeline for published posts.
 *
 *  1. Real internal links: fetch published posts over REST, match the AI's
 *     anchor-text suggestions to actual posts (never invent URLs), inject.
 *  2. Verified external links: AI only proposes a topic; the server resolves
 *     it against Wikipedia's OpenSearch API and links the anchor only when a
 *     stable reference page really exists.
 *  3. SEO bridge: push focus keyphrase / SEO title / meta description /
 *     canonical / social tags / stored green score into Yoast or Rank Math
 *     via the OrbitPress SEO Bridge plugin (see wordpress/ folder).
 *  4. Shared analysis (public/app/seoAnalyzer.js) powers the pre-publish gate.
 */
const { request, requestJson } = require('./http');
const { PublishingContracts } = require('./contracts');
const SeoAnalyzer = require('../public/app/seoAnalyzer');

const BRIDGE_PLUGINS = '/wp-json/orbitpress/v1/seo/plugins';
const BRIDGE_WRITE = '/wp-json/orbitpress/v1/seo';

function canonicalFor(root, slug) {
  return `${root}/${encodeURIComponent(slug)}/`;
}

/** Detect bridge plugin + which SEO plugin(s) are active; never throws. */
async function detectSeo(root, settings) {
  const headers = settings ? require('./wordpress').wordpressHeaders(settings) : {};
  const out = { bridge: false, rankmath: false, yoast: false, bridgeVersion: '' };
  try {
    const info = await requestJson(`${root}${BRIDGE_PLUGINS}`, 'GET', headers);
    if (info && info.ok) {
      out.bridge = true;
      out.rankmath = !!info.rankmath;
      out.yoast = !!info.yoast;
      out.bridgeVersion = info.bridge || '';
    }
  } catch {
    // Bridge absent/unreachable: infer active SEO plugins from the public
    // REST index (one attempt; never fatal to publishing).
    try {
      const index = await requestJson(`${root}/wp-json`, 'GET');
      const namespaces = Array.isArray(index && index.namespaces) ? index.namespaces.join(' ') : '';
      out.rankmath = /rank-?math/i.test(namespaces);
      out.yoast = /yoast/i.test(namespaces);
    } catch { /* site unreachable or REST hidden; publish must not depend on this */ }
  }
  return out;
}

function buildSeoPayload(draft, { canonicalUrl, imageUrl, score }) {
  const keyphrase = String(draft.focusKeyphrase || '').trim();
  const rtl = SeoAnalyzer.isRtl(`${keyphrase} ${draft.title}`);
  const seoTitle = String(draft.seoTitle || '').trim()
    || SeoAnalyzer.buildSeoTitle({ keyphrase, title: draft.title, rtl });
  const seoDescription = String(draft.seoDescription || draft.metaDescription || '').trim()
    || SeoAnalyzer.buildSeoDescription({ keyphrase, metaDescription: draft.metaDescription, title: draft.title, rtl });
  const ogTitle = String(draft.ogTitle || '').trim() || seoTitle;
  const ogDescription = String(draft.ogDescription || '').trim() || seoDescription;
  const hasRecipe = draft.contentType === 'recipe' || (Array.isArray(draft.recipes) && draft.recipes.length > 0);
  const payload = {
    focus_keyphrase: keyphrase.slice(0, 160),
    secondary_keyphrases: (Array.isArray(draft.secondaryKeywords) ? draft.secondaryKeywords : []).slice(0, 4),
    seo_title: seoTitle.slice(0, 60),
    seo_description: seoDescription.slice(0, 160),
    canonical_url: canonicalUrl || '',
    og_title: ogTitle.slice(0, 60),
    og_description: ogDescription.slice(0, 160),
    og_image: imageUrl || '',
    twitter_title: ogTitle.slice(0, 60),
    twitter_description: ogDescription.slice(0, 160),
    twitter_image: imageUrl || '',
    score: Math.max(0, Math.min(100, Math.round(Number(score) || 0))),
    schema_type: hasRecipe ? 'recipe' : 'article',
    robots_index: true,
  };
  return payload;
}

async function applySeoBridge(root, settings, postId, payload) {
  try {
    const result = await requestJson(
      `${root}${BRIDGE_WRITE}`,
      'POST',
      { ...require('./wordpress').wordpressHeaders(settings), 'Content-Type': 'application/json' },
      { post_id: Number(postId), ...payload },
    );
    return { ok: true, result };
  } catch (error) {
    return {
      ok: false,
      status: error && error.status || 0,
      message: String(error && error.message || error),
    };
  }
}

/** Pull up to 300 of the site's published posts for real anchor matching. */
async function fetchPublishedPosts(root, settings, pages = 3) {
  const posts = [];
  for (let page = 1; page <= pages; page += 1) {
    const rows = await requestJson(
      `${root}/wp-json/wp/v2/posts?per_page=100&page=${page}&status=publish&orderby=date&order=desc&_fields=id,title,link,slug,status`,
      'GET',
      require('./wordpress').wordpressHeaders(settings),
    );
    if (!Array.isArray(rows) || rows.length === 0) break;
    rows.forEach((row) => posts.push({
      id: row.id,
      title: row.title && row.title.rendered ? String(row.title.rendered) : '',
      link: String(row.link || ''),
      slug: String(row.slug || ''),
    }));
    if (rows.length < 100) break;
  }
  return posts;
}

/**
 * Resolve one external-reference proposal against Wikipedia OpenSearch.
 * Only stable encyclopaedic pages are accepted; nothing is invented.
 */
async function verifyWikipediaReference(topic, rtl) {
  const lang = rtl ? 'ar' : 'en';
  const url = `https://${lang}.wikipedia.org/w/api.php?action=opensearch&format=json&limit=1&namespace=0&search=`
    + encodeURIComponent(topic);
  try {
    const body = await request(url, 'GET', { 'User-Agent': 'OrbitPress/1.0 (SEO verification)', Accept: 'application/json' }, null, { timeoutMs: 15000 });
    const data = JSON.parse(body.toString('utf8'));
    const titles = data && data[1];
    const urls = data && data[3];
    if (Array.isArray(urls) && urls[0]) {
      return { topic, title: (titles && titles[0]) || topic, url: String(urls[0]) };
    }
  } catch { /* verification failed: simply omit the external link */ }
  return null;
}

/**
 * Public GET against the final permalink (what a visitor's browser would do).
 * Catches broken rewrites or privacy/maintenance plugins. Short budget and
 * best-effort: a VPS often cannot reach its own public hostname (split-horizon
 * DNS / hairpin NAT), so a failed self-GET must NEVER by itself discard a link
 * that the authenticated REST API confirms exists.
 */
async function internalLinkResolves(url) {
  try {
    await request(url, 'GET', { Accept: 'text/html,*/*' }, null, {
      timeoutMs: 5000,
      maxHops: 4,
      allowHttp: /^http:\/\//.test(String(url)),
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Authoritative verification over the SAME authenticated REST channel the
 * publisher already uses: resolve either the ?p=<id> plain permalink or the
 * /<slug>/ pretty permalink back to a published post. Works even when the
 * OrbitPress server cannot browse the site's public URL itself.
 */
async function internalLinkConfirmedByRest(root, settings, link) {
  try {
    const headers = require('./wordpress').wordpressHeaders(settings);
    const u = new URL(link.url);
    const plainId = u.searchParams.get('p');
    if (plainId) {
      const row = await requestJson(`${root}/wp-json/wp/v2/posts/${encodeURIComponent(plainId)}?_fields=id,status,link`, 'GET', headers);
      return !!(row && Number(row.id) === Number(plainId) && (row.status === 'publish' || !row.status));
    }
    const slug = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() || '');
    if (!slug) return false;
    const rows = await requestJson(
      `${root}/wp-json/wp/v2/posts?slug=${encodeURIComponent(slug)}&status=publish&per_page=1&_fields=id,status,link`,
      'GET', headers,
    );
    return Array.isArray(rows) && rows.length > 0;
  } catch {
    return false;
  }
}

/** Remove anchors pointing at any of urls (unwrap them back to their text). */
function unwrapLinks(html, urls) {
  let out = String(html || '');
  urls.forEach((url) => {
    const href = String(url || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`<a\\b[^>]*href="${href}"[^>]*>([\\s\\S]*?)</a>`, 'gi'), '$1');
  });
  return out;
}

/**
 * Return a copy of the draft with verified internal + external links injected
 * into htmlContent, plus a report of what was linked.
 *
 * Internal links come from three real sources, in order:
 *   1. AI anchor suggestions matched to REAL published posts,
 *   2. real post titles already appearing verbatim in the body (autolink),
 *   3. a "related articles" section built from real posts when inline links
 *      are still fewer than two — guaranteeing internal links whenever the
 *      site actually has posts, without ever inventing a URL.
 */
async function enrichDraftLinks(draft, { root, settings, enabledExternal = true, selfId = null }) {
  const report = { internal: [], external: [], skipped: [], postsCount: 0 };
  let html = String(draft.htmlContent || '');
  let posts = [];
  try {
    posts = await fetchPublishedPosts(root, settings);
  } catch (error) {
    report.skipped.push(`internal: ${String(error.message || error).slice(0, 140)}`);
  }
  report.postsCount = posts.length;
  const TARGET_INTERNAL = 3;
  const verifyCache = new Map();

  // A link ships when EITHER the public permalink answers (visitor view) OR
  // the authenticated REST API confirms the post exists. Both failing means
  // the link is genuinely dead and it is dropped (recorded in skipped[]).
  const verify = async (link) => {
    if (verifyCache.has(link.url)) return verifyCache.get(link.url);
    let ok = await internalLinkResolves(link.url);
    let method = 'public-get';
    if (!ok) {
      ok = await internalLinkConfirmedByRest(root, settings, link);
      method = 'rest-confirm';
    }
    if (!ok) {
      report.skipped.push(`internal: رابط غير موجود للمقال «${link.title || link.anchor || ''}» (${link.url})`);
    } else if (method === 'rest-confirm') {
      report.skipped.push(`internal-info: تعذّر طلب الرابط العلني من الخادم نفسه لكن REST أكّد المقال (${link.url})`);
    }
    verifyCache.set(link.url, ok);
    return ok;
  };

  // 1) AI-suggested anchor phrases matched against real posts
  if (posts.length) {
    const suggested = SeoAnalyzer.matchInternalLinks(draft.internalLinks, posts, selfId);
    let checked = [];
    for (const link of suggested.slice(0, TARGET_INTERNAL)) {
      if (await verify(link)) checked.push({ ...link, placement: 'inline' });
    }
    if (checked.length) {
      html = SeoAnalyzer.injectLinks(html, checked);
      // injectLinks skips anchors that do not literally occur in the body.
      checked = checked.filter((l) => html.includes(`href="${l.url}"`));
    }
    report.internal.push(...checked);
  }

  // 2) Reverse autolink: real post titles occurring in the body text
  const linkedIds = new Set(report.internal.map((l) => String(l.id)));
  if (posts.length && report.internal.length < TARGET_INTERNAL) {
    const discovered = SeoAnalyzer.autolinkPosts(html, posts, {
      selfId,
      max: TARGET_INTERNAL - report.internal.length,
      skipIds: linkedIds,
    });
    const good = [];
    for (const link of discovered.links) {
      if (await verify(link)) good.push({ ...link, placement: 'inline' });
    }
    const badUrls = discovered.links.filter((l) => !good.some((g) => g.url === l.url)).map((l) => l.url);
    html = badUrls.length ? unwrapLinks(discovered.html, badUrls) : discovered.html;
    report.internal.push(...good);
  }

  // 3) Related-articles fallback from real posts (only when inline links < 2)
  if (posts.length && report.internal.length < 2) {
    const rtl = SeoAnalyzer.isRtl(`${draft.focusKeyphrase || ''} ${draft.title || ''}`);
    const usedUrls = new Set(report.internal.map((l) => l.url));
    const context = [draft.focusKeyphrase, draft.title, (draft.secondaryKeywords || []).join(' '), draft.categoryName].join(' ');
    const ranked = SeoAnalyzer.rankPostsForContext(posts, context, { selfId })
      .filter(({ p }) => !usedUrls.has(p.link || p.url))
      .slice(0, TARGET_INTERNAL - report.internal.length);
    const sectionLinks = [];
    for (const candidate of ranked) {
      const link = { id: candidate.p.id, anchor: candidate.p.title, url: candidate.p.link || candidate.p.url, title: candidate.p.title };
      if (await verify(link)) sectionLinks.push({ ...link, placement: 'related', score: candidate.score });
    }
    // On a young site with no topical overlap yet, still link the newest real
    // posts rather than shipping zero internal links.
    for (const candidate of ranked.slice(sectionLinks.length)) {
      if (sectionLinks.length >= TARGET_INTERNAL - report.internal.length) break;
      if (sectionLinks.some((l) => l.url === (candidate.p.link || candidate.p.url))) continue;
      const link = { id: candidate.p.id, anchor: candidate.p.title, url: candidate.p.link || candidate.p.url, title: candidate.p.title };
      if (await verify(link)) sectionLinks.push({ ...link, placement: 'related', score: candidate.score });
    }
    if (sectionLinks.length) {
      const rtlBody = SeoAnalyzer.isRtl(`${draft.focusKeyphrase || ''} ${html.slice(0, 200)}`);
      html += SeoAnalyzer.relatedPostsHtml(sectionLinks, rtlBody);
      report.internal.push(...sectionLinks);
    }
  }

  if (enabledExternal && Array.isArray(draft.externalReferences) && draft.externalReferences.length) {
    const rtl = SeoAnalyzer.isRtl(`${draft.focusKeyphrase || ''} ${draft.title}`);
    for (const ref of draft.externalReferences.slice(0, 2)) {
      const verified = await verifyWikipediaReference(ref.topic, rtl);
      if (!verified) { report.skipped.push(`external: no reference for "${ref.topic}"`); continue; }
      if (!new RegExp(SeoAnalyzer.norm(ref.anchor).replace(/\s+/g, '\\s+'), 'i').test(SeoAnalyzer.norm(html))) {
        report.skipped.push(`external: anchor "${ref.anchor}" missing from body`);
        continue;
      }
      // Editorially verified encyclopaedic references are NOT nofollow: they
      // are tagged so the bridge plugin can undo host-side rel rewriting.
      const link = {
        anchor: ref.anchor, url: verified.url, title: verified.title, external: true,
        className: 'orbitpress-trusted-ref', rel: 'noopener',
      };
      report.external.push(link);
      html = SeoAnalyzer.injectLinks(html, [link]);
    }
  }
  return { htmlContent: html, report, posts };
}

/** Run the shared analyzer against a draft and its published representation. */
function analyzeDraft(draft, env = {}) {
  const keyphrase = String(draft.focusKeyphrase || env.keyword || '').trim();
  const rtl = SeoAnalyzer.isRtl(`${keyphrase} ${draft.title || ''}`);
  const seoTitle = String(draft.seoTitle || '').trim()
    || SeoAnalyzer.buildSeoTitle({ keyphrase, title: draft.title, rtl });
  const seoDescription = String(draft.seoDescription || draft.metaDescription || '').trim()
    || SeoAnalyzer.buildSeoDescription({ keyphrase, metaDescription: draft.metaDescription, title: draft.title, rtl });
  const altTexts = Array.isArray(env.altTexts) ? env.altTexts
    : [PublishingContracts.featuredImageAltText(draft.title, draft.contentType, draft.focusKeyphrase),
      PublishingContracts.pinterestImageAltText(draft.pinterestAltText || draft.pinterestTitle, draft.title, draft.focusKeyphrase)];
  return SeoAnalyzer.analyze({
    keyphrase,
    secondaryKeyphrases: draft.secondaryKeywords || [],
    seoTitle,
    seoDescription,
    slug: env.slug || draft.slug,
    contentHtml: env.contentHtml || draft.htmlContent || '',
    wordTarget: env.wordTarget,
    altTexts,
    internalLinkCount: env.internalLinkCount || 0,
    externalLinkCount: env.externalLinkCount || 0,
    keyphraseUsedBefore: !!env.keyphraseUsedBefore,
    contentType: draft.contentType,
    recipe: draft.recipe,
    recipes: draft.recipes,
    recipesCount: Array.isArray(draft.recipes) ? draft.recipes.length : 0,
    schemaValid: env.schemaValid !== false,
  });
}

module.exports = {
  canonicalFor,
  detectSeo,
  buildSeoPayload,
  applySeoBridge,
  fetchPublishedPosts,
  verifyWikipediaReference,
  enrichDraftLinks,
  analyzeDraft,
};
