'use strict';
/**
 * wordpress.js — port of the WordPress + Pinterest publishing operations from
 * MainActivity.kt (categories, testConnection, syncPublishedPosts, publish,
 * repairPreview/repairApply, publishPinterest).
 */
const { request, requestJson } = require('./http');
const {
  PublishingContracts,
  CategorySyncContracts,
  WordPressMarkup,
  DraftContract,
  SeoContract,
} = require('./contracts');
const { getSiteSettings, loadNamedStore, saveNamedStore } = require('./store');
const { parseImage } = require('./images');

function wpRoot(base) {
  return PublishingContracts.requireHttpsUrl(base, 'WordPress URL').replace(/\/wp-json$/, '');
}

function wordpressHeaders(settings) {
  const raw = `${settings.wordpressUsername}:${settings.wordpressAppPassword}`;
  return { Authorization: `Basic ${Buffer.from(raw, 'utf8').toString('base64')}` };
}

function storedSettings(siteId) {
  return getSiteSettings(siteId || 'site-default');
}

/**
 * Settings gates. AI work (analysis, generation) and WordPress work
 * (publishing, sync) are independent: requiring both at once meant a site
 * that was not connected yet could not use the AI side at all.
 */
function requireAiSettings(request) {
  const settings = storedSettings(request.siteId || 'site-default');
  const required = ['articleBaseUrl', 'articleModel', 'articleApiKey'];
  const missing = required.filter((key) => !String(settings[key] || '').trim());
  if (missing.length) throw new Error(`Complete and save the Article API settings first: ${missing.join(', ')}.`);
  PublishingContracts.requireHttpsUrl(settings.articleBaseUrl, 'Article API URL');
  return settings;
}

function requireWordPressSettings(request) {
  const settings = storedSettings(request.siteId || 'site-default');
  const required = ['wordpressBaseUrl', 'wordpressUsername', 'wordpressAppPassword'];
  const missing = required.filter((key) => !String(settings[key] || '').trim());
  if (missing.length) throw new Error(`Complete and save the WordPress settings first: ${missing.join(', ')}.`);
  PublishingContracts.requireHttpsUrl(settings.wordpressBaseUrl, 'WordPress URL');
  return settings;
}

/** Image generation is AI work: it needs the image settings, not WordPress. */
function requireImageSettings(request) {
  const settings = storedSettings(request.siteId || 'site-default');
  const provider = String(settings.imageProvider || 'cloudflare').toLowerCase();
  const missing = [];
  if (!String(settings.imageApiToken || '').trim()) missing.push('Image API token');
  if (provider === 'cloudflare') {
    if (!String(settings.imageAccountId || '').trim()) missing.push('Cloudflare Account ID');
  } else if (!String(settings.imageBaseUrl || '').trim()) {
    missing.push('Image API base URL');
  }
  if (missing.length) throw new Error(`Complete and save the image settings first: ${missing.join(', ')}.`);
  if (provider !== 'cloudflare') PublishingContracts.requireHttpsUrl(settings.imageBaseUrl, 'Image API URL');
  return settings;
}

function requireStoredSettings(request) {
  const settings = requireAiSettings(request);
  requireWordPressSettings(request);
  return settings;
}

// ---------------------------------------------------------------------------

async function categories(request) {
  const settings = requireWordPressSettings(request);
  const root = wpRoot(settings.wordpressBaseUrl);
  const fetched = [];
  for (let page = 1; page <= 100; page += 1) {
    let data;
    try {
      data = await requestJson(`${root}/wp-json/wp/v2/categories?context=edit&per_page=100&hide_empty=false&page=${page}&orderby=name&order=asc`, 'GET', wordpressHeaders(settings));
    } catch (error) {
      if (error.status === 400) break;
      throw error;
    }
    for (const item of Array.isArray(data) ? data : []) fetched.push({ id: item.id, name: item.name });
    if (!Array.isArray(data) || data.length < 100) break;
  }
  const rows = CategorySyncContracts.normalize(fetched).map((item) => ({ id: item.id, name: item.name }));
  return { ok: true, categories: rows };
}

async function testConnection(request) {
  const settings = requireWordPressSettings(request);
  const root = wpRoot(settings.wordpressBaseUrl);
  const profile = await requestJson(`${root}/wp-json/wp/v2/users/me?context=edit`, 'GET', wordpressHeaders(settings));
  return { ok: true, accountName: profile.name || profile.slug || 'WordPress account' };
}

async function findTrackedPost(root, settings, draft) {
  const knownId = Number(draft.wordpressPostId) || 0;
  if (knownId > 0) {
    try {
      return await requestJson(`${root}/wp-json/wp/v2/posts/${knownId}?context=edit`, 'GET', wordpressHeaders(settings));
    } catch { /* fall through to slug lookup */ }
  }
  const slug = DraftContract.cleanSlug(draft.slug);
  if (!slug) return null;
  const rows = await requestJson(`${root}/wp-json/wp/v2/posts?slug=${encodeURIComponent(slug)}&context=edit&per_page=1`, 'GET', wordpressHeaders(settings));
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

async function syncPublishedPosts(request) {
  const settings = requireWordPressSettings(request);
  const root = wpRoot(settings.wordpressBaseUrl);
  const drafts = Array.isArray(request.drafts) ? request.drafts : [];
  const posts = [];
  for (const draft of drafts.slice(0, 100)) {
    if (!draft || draft.generationStatus !== 'published') continue;
    const post = await findTrackedPost(root, settings, draft);
    if (!post) {
      posts.push({ draftId: draft.id, found: false });
    } else {
      posts.push({ draftId: draft.id, found: true, postId: post.id, url: post.link, status: post.status, modified: post.modified });
    }
  }
  return { ok: true, posts };
}

function inspectPublishedPost(post) {
  const content = (post.content && (post.content.raw || post.content.rendered)) || '';
  const missingFeatured = !content.includes('wp-block-image');
  const missingPinterest = !content.includes('data-askinz-pinterest-direct');
  const missingSchema = !content.includes('application/ld+json');
  const reasons = [];
  if (missingFeatured) reasons.push('featured image block');
  if (missingPinterest) reasons.push('Pinterest save button');
  if (missingSchema) reasons.push('structured data');
  return {
    changed: reasons.length > 0,
    missingFeatured,
    missingPinterest,
    missingSchema,
    reason: reasons.length ? `Missing ${reasons.join(', ')}.` : 'Already uses the current template.',
  };
}

async function repairPreview(request) {
  const settings = requireWordPressSettings(request);
  const root = wpRoot(settings.wordpressBaseUrl);
  const drafts = Array.isArray(request.drafts) ? request.drafts : [];
  const posts = [];
  let tracked = 0;
  let matched = 0;
  let fixable = 0;
  for (const draft of drafts.slice(0, 50)) {
    if (!draft || draft.generationStatus !== 'published') continue;
    tracked += 1;
    const post = await findTrackedPost(root, settings, draft);
    if (!post) {
      posts.push({ draftId: draft.id, title: draft.title, matched: false, changed: false, reason: 'Published WordPress post was not found.' });
      continue;
    }
    matched += 1;
    const inspection = inspectPublishedPost(post);
    if (inspection.changed) fixable += 1;
    posts.push({ draftId: draft.id, postId: post.id, title: draft.title, link: post.link, matched: true, changed: inspection.changed, reason: inspection.reason });
  }
  return { ok: true, trackedSystemArticles: tracked, matchedInWordPress: matched, fixablePosts: fixable, posts };
}

async function featuredUrl(root, settings, post) {
  const mediaId = Number(post.featured_media) || 0;
  if (mediaId <= 0) return null;
  try {
    const media = await requestJson(`${root}/wp-json/wp/v2/media/${mediaId}`, 'GET', wordpressHeaders(settings));
    return media.source_url || null;
  } catch {
    return null;
  }
}

function pinterestUrlFromContent(content) {
  const match = /[?&]media=([^&"']+)/i.exec(content);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

function repairBackupStore() {
  return loadNamedStore('repair-backups', { backups: {} });
}

async function repairApply(request) {
  const settings = requireWordPressSettings(request);
  const root = wpRoot(settings.wordpressBaseUrl);
  const drafts = Array.isArray(request.drafts) ? request.drafts : [];
  const results = [];
  const failures = [];
  let updated = 0;
  const backups = repairBackupStore();
  for (const draft of drafts.slice(0, 50)) {
    if (!draft || draft.generationStatus !== 'published') continue;
    try {
      const post = await findTrackedPost(root, settings, draft);
      if (!post) throw new Error('Published WordPress post was not found.');
      const inspection = inspectPublishedPost(post);
      if (!inspection.changed) {
        results.push({ draftId: draft.id, updated: false, reason: 'Already uses the current template.' });
        continue;
      }
      let content = (post.content && (post.content.raw || post.content.rendered)) || '';
      if (!content) throw new Error('WordPress did not return editable post content.');
      backups.backups[`post-${post.id}`] = { savedAt: new Date().toISOString(), content };
      const featured = await featuredUrl(root, settings, post);
      if (inspection.missingFeatured && featured) {
        content = WordPressMarkup.featuredImage(featured, PublishingContracts.featuredImageAltText(draft.title, draft.contentType)) + content;
      }
      let pinterestUrl = pinterestUrlFromContent(content);
      if (inspection.missingPinterest) {
        const images = draft.images || {};
        const reference = images.pinterest || '';
        if (!reference) throw new Error('Pinterest image is missing locally, so this post cannot be repaired safely.');
        const media = await uploadMedia(root, settings, parseImage(reference, true, request.siteId || 'site-default'), `${DraftContract.cleanSlug(draft.slug)}-pinterest`, PublishingContracts.pinterestImageAltText(draft.pinterestTitle, draft.title));
        pinterestUrl = media.source_url;
        const canonical = `${root}/${DraftContract.cleanSlug(draft.slug)}/`;
        const share = 'https://www.pinterest.com/pin/create/button/?url=' + encodeURIComponent(canonical) + '&media=' + encodeURIComponent(pinterestUrl) + '&description=' + encodeURIComponent(draft.pinterestTitle || draft.title || '');
        content += WordPressMarkup.pinterestSaveButton(share);
      }
      if (inspection.missingSchema) {
        const urls = [featured, pinterestUrl].filter(Boolean);
        const schema = DraftContract.buildSchema(draft, `${root}/${DraftContract.cleanSlug(draft.slug)}/`, urls);
        content += WordPressMarkup.structuredData(JSON.stringify(schema));
      }
      const updatedPost = await requestJson(`${root}/wp-json/wp/v2/posts/${post.id}`, 'POST', wordpressHeaders(settings), { content });
      updated += 1;
      results.push({ draftId: draft.id, updated: true, postId: updatedPost.id, link: updatedPost.link, reason: 'Template blocks repaired; encrypted local backup saved first.' });
    } catch (error) {
      failures.push({ draftId: draft.id, title: draft.title, reason: error.message || 'Unknown repair error.' });
    }
  }
  saveNamedStore('repair-backups', backups);
  return { ok: true, updatedPosts: updated, results, failures };
}

async function uploadMedia(root, settings, image, basename, altText) {
  const media = await requestJson(`${root}/wp-json/wp/v2/media`, 'POST', {
    ...wordpressHeaders(settings),
    'Content-Type': image.mimeType,
    'Content-Disposition': `attachment; filename="${basename}.${image.extension}"`,
  }, image.bytes);
  await requestJson(`${root}/wp-json/wp/v2/media/${media.id}`, 'POST', wordpressHeaders(settings), { alt_text: String(altText || '').slice(0, 320) });
  return media;
}

async function resolveTagIds(root, settings, names) {
  const ids = [];
  for (const name of names) {
    const clean = String(name || '').trim().slice(0, 100);
    if (!clean) continue;
    const found = await requestJson(`${root}/wp-json/wp/v2/tags?search=${encodeURIComponent(clean)}&per_page=1`, 'GET', wordpressHeaders(settings));
    if (Array.isArray(found) && found.length > 0) {
      ids.push(found[0].id);
      continue;
    }
    const created = await requestJson(`${root}/wp-json/wp/v2/tags`, 'POST', wordpressHeaders(settings), { name: clean });
    ids.push(created.id);
  }
  return ids;
}

async function requireExistingCategory(root, settings, categoryId) {
  PublishingContracts.requireExistingCategoryId(categoryId);
  const category = await requestJson(`${root}/wp-json/wp/v2/categories/${categoryId}?context=edit`, 'GET', wordpressHeaders(settings));
  if (Number(category.id) !== Number(categoryId)) {
    throw new Error('Choose one of the existing WordPress categories before publishing.');
  }
}

async function publish(request) {
  const settings = requireWordPressSettings(request);
  const draft = request.draft || {};
  const images = request.images || {};
  const root = wpRoot(settings.wordpressBaseUrl);
  const slug = DraftContract.cleanSlug(draft.slug || '');
  if (!slug) throw new Error('The draft slug is invalid.');
  const duplicates = await requestJson(`${root}/wp-json/wp/v2/posts?slug=${encodeURIComponent(slug)}&context=edit&per_page=1`, 'GET', wordpressHeaders(settings));
  if (Array.isArray(duplicates) && duplicates.length > 0) {
    throw new Error('A WordPress post with this slug already exists. Change the title or slug first.');
  }
  const featured = parseImage(String(images.featured || ''), false, request.siteId || 'site-default');
  const pinterest = parseImage(String(images.pinterest || ''), true, request.siteId || 'site-default');
  const featuredAlt = PublishingContracts.featuredImageAltText(draft.title, draft.contentType);
  const pinterestAlt = PublishingContracts.pinterestImageAltText(draft.pinterestTitle, draft.title);
  const categoryId = Number(request.categoryId || settings.categoryId || 0);
  await requireExistingCategory(root, settings, categoryId);
  const featuredMedia = await uploadMedia(root, settings, featured, `${slug}-featured`, featuredAlt);
  const pinterestMedia = await uploadMedia(root, settings, pinterest, `${slug}-pinterest`, pinterestAlt);
  let extraBlocks = '';
  const additional = Array.isArray(images.additional) ? images.additional : [];
  for (let index = 0; index < Math.min(additional.length, 8); index += 1) {
    const reference = String(additional[index] || '').trim();
    if (!reference) continue;
    const media = await uploadMedia(root, settings, parseImage(reference, false, request.siteId || 'site-default'), `${slug}-inline-${index + 1}`, `${draft.title || ''} image ${index + 1}`);
    extraBlocks += WordPressMarkup.featuredImage(media.source_url, `${draft.title || ''} image ${index + 1}`);
  }
  const featuredMediaUrl = featuredMedia.source_url;
  const pinterestMediaUrl = pinterestMedia.source_url;
  const pinTitle = String(draft.pinterestTitle || draft.title || '').trim();
  const share = 'https://www.pinterest.com/pin/create/button/?url=' + encodeURIComponent(`${root}/${slug}/`) + '&media=' + encodeURIComponent(pinterestMediaUrl) + '&description=' + encodeURIComponent(pinTitle);
  const featuredBlock = WordPressMarkup.featuredImage(featuredMediaUrl, featuredAlt);
  const pinBlock = WordPressMarkup.pinterestSaveButton(share);
  const schema = DraftContract.buildSchema(draft, `${root}/${slug}/`, [featuredMediaUrl, pinterestMediaUrl]);
  const post = {
    title: String(draft.title || ''),
    slug,
    status: PublishingContracts.normalizePostStatus(request.postStatus || draft.postStatus || 'publish'),
    content: featuredBlock + String(draft.htmlContent || '') + extraBlocks + pinBlock + WordPressMarkup.structuredData(JSON.stringify(schema)),
    excerpt: draft.metaDescription || '',
    featured_media: featuredMedia.id,
    categories: [categoryId],
  };
  const rawTags = Array.isArray(draft.tags) ? draft.tags : [];
  post.tags = await resolveTagIds(root, settings, PublishingContracts.normalizeTags(rawTags.slice(0, 20)));
  post.meta = {
    orbitpress_canonical_url: SeoContract.canonical(draft.canonicalUrl || ''),
    orbitpress_og_title: SeoContract.text(draft.ogTitle, 100),
    orbitpress_og_description: SeoContract.text(draft.ogDescription, 200),
  };
  const published = await requestJson(`${root}/wp-json/wp/v2/posts`, 'POST', wordpressHeaders(settings), post);
  return { ok: true, url: published.link, postId: published.id };
}

async function publishPinterest(request) {
  const settings = requireWordPressSettings(request);
  const token = String(settings.pinterestAccessToken || '').trim();
  const boardId = String(settings.pinterestBoardId || '').trim();
  if (!token || !boardId) throw new Error('Configure Pinterest access token and board ID first.');
  const draft = request.draft || {};
  const image = parseImage(String(request.image || ''), true, request.siteId || 'site-default');
  const payload = {
    board_id: boardId,
    title: String(draft.pinterestTitle || draft.title || '').slice(0, 100),
    description: String(draft.metaDescription || '').slice(0, 800),
    alt_text: String(draft.pinterestAltText || draft.title || '').slice(0, 500),
    link: String(request.link || ''),
    ai_disclosures: { values: ['AI_MODIFIED'] },
    media_source: { source_type: 'image_base64', content_type: image.mimeType, data: image.bytes.toString('base64') },
  };
  const response = await requestJson('https://api.pinterest.com/v5/pins', 'POST', {
    Authorization: `Bearer ${token}`,
  }, payload);
  return { ...response, ok: true };
}

// --- image generation (Cloudflare Workers AI / OpenAI-compatible) ----------

async function generateImage(request) {
  const settings = requireImageSettings(request);
  const provider = String(settings.imageProvider || 'cloudflare').toLowerCase();
  const kind = String(request.kind || 'featured');
  const configuredPrompt = String(kind === 'pinterest' ? (settings.pinterestPrompt || '') : (settings.imagePrompt || '')).trim();
  const prompt = (configuredPrompt || String(request.prompt || '')).trim()
    .replace(/\{\{title\}\}/g, String(request.title || ''))
    .replace(/\{\{keyword\}\}/g, String(request.keyword || ''));
  const { MediaPublishingContract } = require('./contracts');
  const normalized = MediaPublishingContract.normalizePrompt(prompt);
  const width = Math.min(2048, Math.max(512, Number(request.width) || 1024));
  const height = Math.min(2048, Math.max(512, Number(request.height) || 1024));
  const token = String(settings.imageApiToken || '').trim();
  if (!token) throw new Error('Configure an image generation API token first.');
  let image;
  if (provider === 'cloudflare') {
    image = await generateCloudflareImage(settings, normalized);
  } else {
    image = await generateOpenAiCompatibleImage(settings, normalized, width, height);
  }
  if (!['featured', 'pinterest', 'article'].includes(kind)) throw new Error('Unknown generated image type.');
  const validated = require('./images').validateImage(image.bytes, image.mimeType, kind === 'pinterest');
  const fs = require('fs');
  const path = require('path');
  const reference = `local://${require('crypto').randomUUID()}.${validated.extension}`;
  fs.writeFileSync(path.join(require('./images').imageDirectory(request.siteId || 'site-default'), reference.slice('local://'.length)), validated.bytes, { mode: 0o600 });
  return { ok: true, reference, mimeType: validated.mimeType, provider };
}

/**
 * Connectivity probe for the image provider: one small image, metadata only
 * (the bytes are discarded). Providers differ in supported sizes, so the
 * probe asks for the smallest widely supported one and reports the exact
 * error when the provider refuses.
 */
async function testImageApi(request) {
  const settings = requireImageSettings(request);
  const provider = String(settings.imageProvider || 'cloudflare').toLowerCase();
  const prompt = 'A single red apple on a plain white background, studio lighting';
  const started = Date.now();
  try {
    const image = provider === 'cloudflare'
      ? await generateCloudflareImage(settings, prompt)
      : await generateOpenAiCompatibleImage(settings, prompt, 512, 512);
    const bytes = image.bytes && image.bytes.length ? image.bytes.length : 0;
    if (!bytes) return { ok: false, provider, latencyMs: Date.now() - started, message: 'The provider returned an empty image.' };
    return {
      ok: true,
      provider,
      model: String(settings.imageModel || (provider === 'cloudflare' ? '@cf/black-forest-labs/flux-1-schnell' : 'default')),
      latencyMs: Date.now() - started,
      bytes,
      mimeType: image.mimeType,
    };
  } catch (error) {
    return { ok: false, provider, latencyMs: Date.now() - started, message: String(error.message || 'Image API test failed.').slice(0, 300) };
  }
}

async function generateCloudflareImage(settings, prompt) {
  const accountId = String(settings.imageAccountId || '').trim();
  if (!accountId) throw new Error('Cloudflare Account ID is required.');
  const model = String(settings.imageModel || '@cf/black-forest-labs/flux-1-schnell');
  const response = await requestJson(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`, 'POST', {
    Authorization: `Bearer ${settings.imageApiToken}`,
  }, { prompt, steps: 4 });
  const encoded = response.image || (response.result && response.result.image) || '';
  if (!encoded) throw new Error('Cloudflare returned no generated image.');
  return { bytes: Buffer.from(encoded, 'base64'), mimeType: 'image/jpeg' };
}

async function generateOpenAiCompatibleImage(settings, prompt, width, height) {
  const endpoint = PublishingContracts.requireHttpsUrl(settings.imageBaseUrl, 'Image API URL');
  const url = endpoint.endsWith('/images/generations') ? endpoint : `${endpoint}/images/generations`;
  const response = await requestJson(url, 'POST', {
    Authorization: `Bearer ${settings.imageApiToken}`,
  }, { model: settings.imageModel || 'gpt-image-1', prompt, size: `${width}x${height}`, response_format: 'b64_json' });
  const item = response.data && response.data[0];
  const encoded = item && (item.b64_json || '');
  if (!encoded) throw new Error('Image provider returned no base64 image.');
  return { bytes: Buffer.from(encoded, 'base64'), mimeType: 'image/png' };
}

module.exports = {
  wpRoot,
  wordpressHeaders,
  storedSettings,
  requireStoredSettings,
  requireAiSettings,
  requireWordPressSettings,
  requireImageSettings,
  categories,
  testConnection,
  syncPublishedPosts,
  repairPreview,
  repairApply,
  publish,
  publishPinterest,
  generateImage,
  testImageApi,
  inspectPublishedPost,
  findTrackedPost,
};
