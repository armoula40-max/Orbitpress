'use strict';
/**
 * wordpress.js — port of the WordPress + Pinterest publishing operations from
 * MainActivity.kt (categories, testConnection, syncPublishedPosts, publish,
 * repairPreview/repairApply, publishPinterest).
 */
const { request, requestJson, requestRawJson, requestText } = require('./http');
const {
  PublishingContracts,
  CategorySyncContracts,
  WordPressMarkup,
  DraftContract,
  SeoContract,
} = require('./contracts');
const { getSiteSettings, loadNamedStore, saveNamedStore } = require('./store');
const { parseImage } = require('./images');
const transcode = require('./imagetranscode');

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
      data = await withWordPressHelp(requestJson(`${root}/wp-json/wp/v2/categories?context=edit&per_page=100&hide_empty=false&page=${page}&orderby=name&order=asc`, 'GET', wordpressHeaders(settings)));
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

/**
 * A 401 has at least five different causes and WordPress answers all of them
 * with the same two lines, so the raw message is useless on its own: point at
 * the diagnostic instead of letting people guess.
 */
function explainWordPressFailure(error) {
  const body = String((error && error.body) || (error && error.message) || '');
  if (error && error.status === 401 && /rest_not_logged_in/.test(body)) {
    return 'WordPress refused these credentials (401 rest_not_logged_in). Press “Diagnose WordPress connection” — it asks the site itself and names the cause: a username that is not the WordPress login name, an Application Password WordPress disabled because the site is not HTTPS, a host that strips the Authorization header, or a REST API blocked by a security plugin.';
  }
  return null;
}

function withWordPressHelp(operation) {
  return operation.catch((error) => {
    const explained = explainWordPressFailure(error);
    if (explained) error.message = explained;
    throw error;
  });
}

async function testConnection(request) {
  const settings = requireWordPressSettings(request);
  const root = wpRoot(settings.wordpressBaseUrl);
  return withWordPressHelp(Promise.resolve().then(async () => {
    let accountName;
    let usersEndpointBlocked = false;
    try {
      const profile = await requestJson(`${root}/wp-json/wp/v2/users/me?context=edit`, 'GET', wordpressHeaders(settings));
      accountName = profile.name || profile.slug || 'WordPress account';
    } catch (error) {
      // Security plugins and some hosts block the users endpoint while the
      // credentials are perfectly good. Publishing only needs edit access to
      // posts, so verify there before declaring the connection broken.
      if (error.status !== 401 && error.status !== 403) throw error;
      await requestJson(`${root}/wp-json/wp/v2/posts?context=edit&per_page=1`, 'GET', wordpressHeaders(settings));
      accountName = `${settings.wordpressUsername || 'WordPress user'} (verified through posts — users/me is blocked)`;
      usersEndpointBlocked = true;
    }
    // A readable users/me only proves the password works; publishing also
    // uploads binary media, which a role without upload_files or a host WAF
    // can block independently. Round-trip a tiny JPEG and delete it so the
    // failure surfaces here instead of halfway through a publish run.
    await verifyMediaUpload(root, settings);
    const result = { ok: true, accountName, uploadsVerified: true };
    if (usersEndpointBlocked) result.usersEndpointBlocked = true;
    return result;
  }));
}

/**
 * POSTs a tiny JPEG to the media endpoint and deletes it. This exercises the
 * exact raw-binary path publishing uses (auth, Content-Type/Disposition,
 * body not stripped by a firewall), so a role/WAF/type problem is named from
 * the Settings screen rather than reported as rest_upload_sideload_error at
 * publish time.
 */
async function verifyMediaUpload(root, settings) {
  const probe = await transcode.probeJpeg();
  let media;
  try {
    media = await postMedia(root, settings, probe, 'orbitpress-connection-test.jpg');
  } catch (error) {
    throw new Error(explainUploadFailure(error, probe, 'orbitpress-connection-test.jpg'));
  }
  if (media && media.id) {
    await request(`${root}/wp-json/wp/v2/media/${media.id}?force=true`, 'DELETE', wordpressHeaders(settings), null)
      .catch(() => { /* the probe being stored is harmless; cleanup is best-effort */ });
  }
}

/**
 * Step-by-step report of why a WordPress connection does or does not work.
 *
 * A bare "401 rest_not_logged_in" hides at least five different problems
 * (wrong login name, no Application Password, plain HTTP, a host that strips
 * the Authorization header, a blocked REST API), so instead of guessing this
 * asks the site itself, one probe at a time, and names what it finds.
 */
async function diagnoseWordPress(request) {
  const settings = storedSettings(request.siteId || 'site-default');
  const raw = String(settings.wordpressBaseUrl || '').trim();
  const username = String(settings.wordpressUsername || '').trim();
  const password = String(settings.wordpressAppPassword || '').trim();
  const steps = [];
  const advice = [];
  const push = (step) => { steps.push(step); return step; };

  if (!raw) {
    return { ok: false, steps, advice: ['أضف رابط الموقع في حقل Website URL ثم أعد الفحص.'], message: 'رابط وردبريس غير مُعيَّن.' };
  }
  let root;
  try {
    root = wpRoot(raw);
  } catch (error) {
    return { ok: false, steps, advice: ['رابط الموقع يجب أن يبدأ بـ https:// — وردبريس يعطّل Application Passwords على HTTP العادي.'], message: error.message };
  }
  if (!username || !password) {
    advice.push('أكمل اسم المستخدم وكلمة التطبيق (Application Password) من Users → Profile في لوحة وردبريس.');
  }

  const trail = [];
  /** One GET against the site. `mode` is 'anon', 'auth' or 'alt-header'. */
  const probe = async (label, path, mode) => {
    const url = `${root}${path}`;
    const basic = `Basic ${Buffer.from(`${username}:${password}`, 'utf8').toString('base64')}`;
    const headers = mode === 'auth' ? { Authorization: basic }
      : mode === 'alt-header' ? { 'X-Authorization': basic }
        : {};
    const stepTrail = [];
    try {
      const text = await requestText(url, 'GET', headers, null, { timeoutMs: 20000, trail: stepTrail });
      let json = null;
      try { json = JSON.parse(text); } catch { /* html or plain text */ }
      return push({ label, url, status: 200, ok: true, json, redirected: stepTrail.length > 1 ? stepTrail[stepTrail.length - 1].url : '', note: json ? '' : `الرد ليس JSON (${text.slice(0, 80).replace(/\s+/g, ' ')})` });
    } catch (error) {
      let json = null;
      try { json = JSON.parse(String(error.body || '')); } catch { /* keep null */ }
      return push({ label, url, status: error.status || 0, ok: false, code: json && json.code ? json.code : '', redirected: stepTrail.length > 1 ? stepTrail[stepTrail.length - 1].url : '', note: String(error.message || '').slice(0, 200) });
    }
  };

  // 1. is the REST API there at all, and does it advertise application passwords?
  const apiRoot = await probe('فحص REST API (بدون بيانات)', '/wp-json/', 'anon');
  const auth = apiRoot.json && apiRoot.json.authentication ? Object.keys(apiRoot.json.authentication) : [];
  const advertisesAppPasswords = auth.includes('application-passwords');
  if (!apiRoot.ok) {
    advice.push('واجهة REST لا تجيب. تأكد من أن الرابط هو عنوان الموقع نفسه، وأن /wp-json/ مفتوح وليس محجوباً بإضافة حماية أو بقاعدة في الخادم.');
  } else if (apiRoot.json && !advertisesAppPasswords) {
    advice.push('الموقع لا يُعلن دعم Application Passwords. السبب الأشيع: الموقع غير HTTPS، أو أن الإضافة معطّلة، أو إصدار وردبريس أقدم من 5.6.');
  }

  // 2. credentials against users/me, then again without ?context=edit to tell
  //    "wrong password" apart from "right password, not enough capability"
  const me = await probe('فحص البيانات على users/me (context=edit)', '/wp-json/wp/v2/users/me?context=edit', 'auth');
  let capabilities = null;
  if (!me.ok && me.status === 401) {
    const plain = await probe('فحص البيانات على users/me (بدون context=edit)', '/wp-json/wp/v2/users/me', 'auth');
    if (plain.ok) {
      capabilities = true;
      advice.push('البيانات صحيحة لكن المستخدم لا يملك صلاحية التحرير (context=edit). استخدم مستخدماً بصلاحية Administrator أو Editor.');
    }
  }
  let editAccess = null;
  let altHeader = null;
  if (!me.ok) {
    // Two questions this report keeps being asked, and they have different
    // answers: are the credentials good but the users endpoint blocked, and
    // does the host drop the Authorization header on the way to PHP?
    editAccess = await probe('فحص صلاحية التحرير على المقالات (posts?context=edit)', '/wp-json/wp/v2/posts?context=edit&per_page=1', 'auth');
    if (editAccess.ok) {
      advice.push('البيانات **صحيحة**: الموقع قبلها على posts?context=edit. المشكلة في مسار users/me نفسه، وغالباً تحجبه إضافة حماية (Wordfence وأشباهها) أو قاعدة في الخادم. عطّل حجب مسار users مؤقتاً، أو اكتفِ بصلاحية المقالات — OrbitPress يتحقق من الاتصال عبر المقالات عندما يكون users/me محجوباً.');
    }
    if (username && password) {
      altHeader = await probe('فحص البيانات بترويسة X-Authorization', '/wp-json/wp/v2/users/me?context=edit', 'alt-header');
      if (altHeader.ok) {
        advice.push('الموقع قبل البيانات عبر ترويسة **X-Authorization** ورفضها عبر Authorization — أي أن الخادم يحذف ترويسة Authorization قبل أن تصل إلى PHP. أضف في .htaccess: SetEnvIf Authorization "(.*)" HTTP_AUTHORIZATION=$1 وإن كان NGINX: fastcgi_param HTTP_AUTHORIZATION $http_authorization;');
      }
    }
  }
  if (me.ok) {
    advice.push('');
  } else if (me.status === 401) {
    advice.push('رفض وردبريس البيانات (401). تحقّق بالترتيب: 1) اسم المستخدم هو user_login لا البريد ولا الاسم الظاهر. 2) كلمة التطبيق من Users → Profile → Application Passwords. 3) الموقع HTTPS فعلاً. 4) الخادم لا يحذف ترويسة Authorization — إن كان Apache أضف في .htaccess: SetEnvIf Authorization "(.*)" HTTP_AUTHORIZATION=$1');
  } else if (me.status === 403) {
    advice.push('وردبريس قبل البيانات لكنه منع هذا الطلب (403) — غالباً إضافة حماية تحجب مسارات REST.');
  }
  if (!me.ok && !(editAccess && editAccess.ok) && !(altHeader && altHeader.ok)) {
    advice.push('الموقع يردّ 401 نفسه مع البيانات وبدونها، وهذا لا يميّز بين «كلمة تطبيق خاطئة» و«الخادم يحذف الترويسة». احسمهما بأمر واحد على سيرفرك: curl -i -u \'USER:APP_PASSWORD\' \'<رابط الموقع>/wp-json/wp/v2/users/me?context=edit\' — إن أجاب 200 فالبيانات سليمة والترويسة تُحذف في الطريق، وإن أجاب 401 فالاسم أو كلمة التطبيق خطأ.');
  }

  // 3. can we list categories? that is what publishing relies on
  const categories = await probe('فحص التصنيفات (المسار عام)', '/wp-json/wp/v2/categories?per_page=1&hide_empty=false', 'auth');
  if (!categories.ok) {
    advice.push('تعذّر جلب التصنيفات، وهذا يعني أن النشر سيفشل أيضاً. أصلح الخطوة السابقة أولاً.');
  }

  const ok = me.ok && categories.ok;
  // Where the site actually answers vs. where we asked: a redirect to another
  // host or scheme is its own reason credentials can fail.
  const hops = trail.map((entry) => entry.url);
  const originOf = (value) => { try { return new URL(value).origin; } catch { return ''; } };
  const canonical = originOf(hops[hops.length - 1] || '');
  if (canonical && canonical !== originOf(root)) {
    advice.push(`الموقع يجيب فعلياً على ${canonical} بينما الرابط المحفوظ ${originOf(root)} — احفظ الرابط الذي يجيب فعلاً في حقل Website URL.`);
  }
  return {
    ok,
    root,
    canonical,
    trail,
    usernameConfigured: !!username,
    passwordConfigured: !!password,
    advertisesAppPasswords,
    capabilities,
    editAccessWorks: !!(editAccess && editAccess.ok),
    altHeaderWorks: !!(altHeader && altHeader.ok),
    accountName: me.ok && me.json ? (me.json.name || me.json.slug || '') : '',
    steps: steps.map(({ json, ...rest }) => rest),
    advice: advice.filter(Boolean),
  };
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

/**
 * WordPress names the uploaded file from Content-Disposition, and HTTP header
 * values must be bytes, not arbitrary text: a slug in Arabic, Chinese or
 * Russian makes Headers.set() throw "Cannot convert argument to a ByteString".
 * Keep the name readable and guaranteed-ASCII, and keep the real extension.
 */
function safeUploadBasename(basename, extension) {
  const ascii = String(basename || '')
    .normalize('NFKD')
    .replace(/[^\x20-\x7e]/g, '-')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)
    .replace(/-$/, '');
  return `${ascii || 'orbitpress-image'}.${extension}`;
}

function isFileTypeRejection(error) {
  const body = String((error && (error.body || error.message)) || '');
  return /rest_upload_sideload_error|rest_upload_image_type_not_supported|rest_upload_invalid_mime_type|not allowed to upload this file type|this file type is not permitted/i.test(body);
}

function isUploadPermissionRejection(error) {
  const body = String((error && (error.body || error.message)) || '');
  return /rest_cannot_create|not allowed to upload media/i.test(body);
}

/** WordPress' own refusal, in words that say what to change. */
function explainUploadFailure(error, image, filename) {
  const body = String((error && (error.body || error.message)) || '');
  const codeMatch = /"code"\s*:\s*"([a-z_]+)"/i.exec(body);
  const code = codeMatch ? codeMatch[1] : '';
  const status = error && error.status ? ` (${error.status})` : '';
  if (isUploadPermissionRejection(error)) {
    return `WordPress accepted the login, but this user account is not allowed to upload files${status}. Use an Administrator, Editor, or Author account, or grant the account the upload_files capability.`;
  }
  if (code === 'rest_upload_sideload_error' || isFileTypeRejection(error)) {
    // A standard JPEG failing means the format cannot be the cause: the
    // uploaded body is being stripped/emptied before WordPress stores it.
    if (image.mimeType === 'image/jpeg') {
      return `WordPress rejected a standard JPEG (${filename}) as a disallowed file type${status}, so this is not an image-format problem. A security plugin or the server firewall (WAF/ModSecurity) is usually stripping the uploaded body before WordPress stores it. Verify you can add a JPEG from wp-admin → Media → Add New, then ask your host to allow POST uploads to /wp-json/wp/v2/media.`;
    }
    return `WordPress refused the image ${filename} as ${image.mimeType}${status}. WordPress decides the file type from the uploaded bytes and the Content-Type header. OrbitPress already sends WebP images as JPEG and retries refused PNG images as JPEG; if you see this, allow ${image.mimeType} on the site (a security plugin, a hosting policy, or the upload_mimes filter can remove a type WordPress would otherwise accept), or use a JPEG.`;
  }
  if (code === 'rest_upload_no_data') {
    return `WordPress received an empty upload for ${filename}${status}, which usually means a firewall or proxy stripped the request body. Try again; if it persists, ask your host to allow upload bodies on /wp-json/wp/v2/media.`;
  }
  if (code === 'rest_cannot_create') {
    return `WordPress accepted your credentials but your user is not allowed to upload files${status}. Use an Administrator or Editor account, or grant the account the upload_files capability.`;
  }
  return String((error && error.message) || `Uploading ${filename} failed.`).slice(0, 400);
}

function postMedia(root, settings, image, filename) {
  return requestRawJson(`${root}/wp-json/wp/v2/media`, 'POST', {
    ...wordpressHeaders(settings),
    'Content-Type': image.mimeType,
    'Content-Disposition': `attachment; filename="${filename}"`,
  }, image.bytes);
}

async function uploadMedia(root, settings, image, basename, altText) {
  // WebP is refused by WordPress < 5.8, by multisite upload lists and by
  // several security plugins. JPEG is accepted everywhere, so normalize
  // proactively at the WordPress boundary.
  let prepared = image;
  if (transcode.shouldTranscodeToJpeg(image.mimeType)) {
    try {
      prepared = await transcode.transcodeToJpeg(image.bytes);
    } catch {
      prepared = image; // fall through; the retry below handles refusal
    }
  }
  let media;
  try {
    media = await postMedia(root, settings, prepared, safeUploadBasename(basename, prepared.extension));
  } catch (error) {
    if (isFileTypeRejection(error) && prepared.mimeType !== transcode.JPEG_MIME) {
      // A PNG (or a WebP that could not be pre-converted) was refused: send
      // the same image once more as a plain JPEG, which every install accepts.
      let fallback = null;
      try {
        fallback = await transcode.transcodeToJpeg(image.bytes);
      } catch {
        fallback = null;
      }
      if (fallback) {
        try {
          media = await postMedia(root, settings, fallback, safeUploadBasename(basename, fallback.extension));
        } catch (retryError) {
          throw new Error(explainUploadFailure(retryError, fallback, safeUploadBasename(basename, fallback.extension)));
        }
      } else {
        throw new Error(explainUploadFailure(error, prepared, safeUploadBasename(basename, prepared.extension)));
      }
    } else {
      throw new Error(explainUploadFailure(error, prepared, safeUploadBasename(basename, prepared.extension)));
    }
  }
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

/**
 * The exact HTML that reaches WordPress. `publish` and the article preview
 * both build it here, so what the user previews is what gets published — a
 * preview that re-implements the layout would drift from the real post.
 */
function assemblePublishedHtml({ draft, root, slug, featuredUrl, pinterestUrl, additionalUrls }) {
  const blocks = [];
  if (featuredUrl) {
    blocks.push(WordPressMarkup.featuredImage(featuredUrl, PublishingContracts.featuredImageAltText(draft.title, draft.contentType)));
  }
  blocks.push(String(draft.htmlContent || ''));
  (additionalUrls || []).forEach((url, index) => {
    if (url) blocks.push(WordPressMarkup.featuredImage(url, `${draft.title || ''} image ${index + 1}`));
  });
  const canonical = `${root}/${slug}/`;
  const share = 'https://www.pinterest.com/pin/create/button/?url=' + encodeURIComponent(canonical)
    + '&media=' + encodeURIComponent(pinterestUrl || '')
    + '&description=' + encodeURIComponent(String(draft.pinterestTitle || draft.title || '').trim());
  blocks.push(WordPressMarkup.pinterestSaveButton(share));
  blocks.push(WordPressMarkup.structuredData(JSON.stringify(
    DraftContract.buildSchema(draft, canonical, [featuredUrl, pinterestUrl].filter(Boolean)),
  )));
  return blocks.join('');
}

/**
 * Preview of the post as it will be published, built from the images stored on
 * this server — nothing is uploaded and WordPress is not contacted. The image
 * URLs point at /api/images, so the preview shows the real files.
 */
async function previewArticle(request) {
  const draft = request.draft || {};
  const images = request.images || {};
  const siteId = request.siteId || 'site-default';
  const settings = storedSettings(siteId);
  const slug = DraftContract.cleanSlug(draft.slug || '') || 'preview';
  const configured = String(settings.wordpressBaseUrl || '').trim();
  const root = configured ? wpRoot(configured) : 'https://your-site.com';
  const localUrl = (reference) => `/api/images/${String(reference || '').replace(/^local:\/\//, '')}?siteId=${encodeURIComponent(siteId)}`;
  const additional = (Array.isArray(images.additional) ? images.additional.slice(0, 8) : []).filter(Boolean).map(localUrl);
  const html = assemblePublishedHtml({
    draft,
    root,
    slug,
    featuredUrl: images.featured ? localUrl(images.featured) : '',
    pinterestUrl: images.pinterest ? localUrl(images.pinterest) : '',
    additionalUrls: additional,
  });
  return {
    ok: true,
    html,
    canonical: `${root}/${slug}/`,
    placeholderLinks: !configured,
    title: String(draft.title || ''),
    categoryName: String(draft.categoryName || ''),
  };
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
  const additional = Array.isArray(images.additional) ? images.additional : [];
  const uploadedAdditional = [];
  for (let index = 0; index < Math.min(additional.length, 8); index += 1) {
    const reference = String(additional[index] || '').trim();
    if (!reference) continue;
    const media = await uploadMedia(root, settings, parseImage(reference, false, request.siteId || 'site-default'), `${slug}-inline-${index + 1}`, `${draft.title || ''} image ${index + 1}`);
    uploadedAdditional.push(media.source_url);
  }
  const content = assemblePublishedHtml({
    draft,
    root,
    slug,
    featuredUrl: featuredMedia.source_url,
    pinterestUrl: pinterestMedia.source_url,
    additionalUrls: uploadedAdditional,
  });
  const post = {
    title: String(draft.title || ''),
    slug,
    status: PublishingContracts.normalizePostStatus(request.postStatus || draft.postStatus || 'publish'),
    content,
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
  // A published article URL is the pin destination; without one we still need
  // WordPress to resolve where the article lives.
  if (!String(request.link || '').trim()) requireWordPressSettings(request);
  const settings = storedSettings(request.siteId || 'site-default');
  const boardId = String(request.boardId || settings.pinterestBoardId || '').trim();
  const draft = request.draft || {};
  const draftImages = draft.images && typeof draft.images === 'object' ? draft.images : {};
  // The composed pin wins: it carries the headline the reader sees. An
  // untouched upload is the fallback when the pin was never saved.
  const reference = String(request.image || draftImages.pin || draftImages.pinterest || '');
  if (!reference) throw new Error('احفظ صورة بينترست أولاً (صورة 2:3 أو دبوساً مركّباً من استوديو الدبوس).');
  if (!boardId) throw new Error('حدّد لوحة النشر في الإعدادات: معرّف اللوحة أو رابطها (Settings → Pinterest board ID).');
  const image = parseImage(reference, true, request.siteId || 'site-default');
  const title = String(draft.pinTitle || draft.pinterestTitle || draft.title || '').slice(0, 100);
  const description = String(draft.pinDescription || draft.metaDescription || '').slice(0, 800);
  const altText = String(draft.pinAltText || draft.pinterestAltText || draft.title || '').slice(0, 500);

  // Preferred path: the session the user signed in with inside OrbitPress.
  // Remember exactly why it could not run so the fallback error can name it.
  let sessionFailure = null;
  try {
    const publisher = require('./scraper/pinterestPublish');
    const viaSession = await publisher.publishPinWithSession({
      boardId, title, description, link: String(request.link || ''), image, altText,
    });
    if (viaSession.ok) return { ok: true, method: 'session', id: viaSession.pinId, pinUrl: viaSession.pinUrl };
    sessionFailure = { stage: viaSession.stage, message: viaSession.message };
    // A connected session that fails at upload/create has no usable token
    // fallback unless the user actually saved one.
    if (viaSession.stage !== 'session' && viaSession.stage !== 'board') {
      const token = String(settings.pinterestAccessToken || '').trim();
      if (!token) throw new Error(`تعذّر النشر بالجلسة (${viaSession.stage}): ${viaSession.message}`);
    }
  } catch (error) {
    if (!String(settings.pinterestAccessToken || '').trim()) throw error;
    sessionFailure = sessionFailure || { stage: 'session', message: error.message };
  }

  const token = String(settings.pinterestAccessToken || '').trim();
  if (!token) {
    const reason = sessionFailure ? ` (${sessionFailure.stage}: ${sessionFailure.message})` : '';
    throw new Error(`اربط حساب Pinterest من بطاقة "الحسابات المرتبطة — تسجيل دخول السيرفر" في الإعدادات (تنشر الدبابيس بلا تطبيق مطوّر)، أو أضف رمز وصول API مُعتمَداً واللوحة${reason}.`);
  }
  const payload = {
    board_id: boardId,
    title,
    description,
    alt_text: altText,
    link: String(request.link || ''),
    ai_disclosures: { values: ['AI_MODIFIED'] },
    media_source: { source_type: 'image_base64', content_type: image.mimeType, data: image.bytes.toString('base64') },
  };
  let response;
  try {
    response = await requestJson(`${pinterestApiBase()}/v5/pins`, 'POST', {
      Authorization: `Bearer ${token}`,
    }, payload);
  } catch (error) {
    throw new Error(explainPinterestApiError(error, sessionFailure));
  }
  return { ...response, ok: true, method: 'api-token' };
}

/**
 * Pinterest's v5 API answers with numeric codes whose meaning is invisible in
 * the raw response. Code 3 ("application consumer type is not supported")
 * means the developer app that minted the token is still on "Trial access
 * pending" / not activated by Pinterest — no endpoint, even reads, works with
 * it, and waiting on support is the only token-side fix. The built-in browser
 * session publishes with no developer app at all, so point there.
 */
function pinterestApiBase() {
  return String(process.env.ORBITPRESS_PINTEREST_API_BASE || 'https://api.pinterest.com').replace(/\/+$/, '');
}

function explainPinterestApiError(error, sessionFailure) {
  const body = String((error && (error.body || error.message)) || '');
  let parsed = null;
  const firstBrace = body.indexOf('{');
  if (firstBrace >= 0) {
    try { parsed = JSON.parse(body.slice(firstBrace)); } catch { /* truncated snippet */ }
  }
  const code = parsed && parsed.code;
  const apiMessage = parsed && parsed.message ? String(parsed.message) : body.slice(0, 180);
  const sessionHint = sessionFailure
    ? ` كما تعذّر مسار جلسة المتصفح (${sessionFailure.stage}): ${String(sessionFailure.message || '').replace(/\s+/g, ' ').slice(0, 200)}.`
    : ' ولا توجد جلسة Pinterest متصلة حالياً.';
  if (Number(code) === 3 || /consumer type is not supported/i.test(body)) {
    return 'رفض Pinterest رمز الـ API (الكود 3: application consumer type is not supported). تطبيق المطوّر الذي أنشأت منه الرمز ما زال في حالة "Trial access pending" أو غير مُفعَّل من Pinterest، فلا يقبل إنشاء الدبابيس حتى تتم الموافقة عليه (ورموز sandbox لا تعمل إلا على api-sandbox.pinterest.com). الحل الفوري بلا انتظار موافقة: افتح Settings ثم بطاقة "الحسابات المرتبطة — تسجيل دخول السيرفر" وسجّل دخول Pinterest مرة واحدة، فينشر OrbitPress عبر جلسة المتصفح نفسها بدون تطبيق مطوّر.' + sessionHint;
  }
  if (Number(code) === 1 || Number(code) === 2 || /unauthorized|invalid.*token|token.*expired|not logged in/i.test(body)) {
    return `رفض Pinterest رمز الوصول (${apiMessage || `الحالة ${error && error.status}`}). أنشئ رمزاً جديداً بصلاحيات boards:write وpins:write، أو استخدم بطاقة "الحسابات المرتبطة" لتسجيل الدخول بالجلسة بلا رمز API.${sessionHint}`;
  }
  return `فشل النشر عبر Pinterest API: ${apiMessage}${sessionHint}`;
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
  // Ask for the shape the slot needs. Cloudflare's flux schema takes no size
  // at all and always answers square, so the browser fits the result — that is
  // why `store:false` exists: it returns the raw bytes for the UI to compose.
  const shape = imageShapeFor(kind, request);
  const token = String(settings.imageApiToken || '').trim();
  if (!token) throw new Error('Configure an image generation API token first.');
  let image;
  if (provider === 'cloudflare') {
    image = await generateCloudflareImage(settings, normalized);
  } else {
    image = await generateOpenAiCompatibleImage(settings, normalized, shape.width, shape.height);
  }
  if (!['featured', 'pinterest', 'article'].includes(kind)) throw new Error('Unknown generated image type.');
  const dimensions = require('./images').imageDimensions(image.bytes, image.mimeType);
  if (request.store === false) {
    return {
      ok: true,
      dataUrl: `data:${image.mimeType};base64,${image.bytes.toString('base64')}`,
      mimeType: image.mimeType,
      provider,
      width: dimensions ? dimensions.width : 0,
      height: dimensions ? dimensions.height : 0,
    };
  }
  const validated = require('./images').validateImage(image.bytes, image.mimeType, kind === 'pinterest');
  const fs = require('fs');
  const path = require('path');
  const reference = `local://${require('crypto').randomUUID()}.${validated.extension}`;
  fs.writeFileSync(path.join(require('./images').imageDirectory(request.siteId || 'site-default'), reference.slice('local://'.length)), validated.bytes, { mode: 0o600 });
  return { ok: true, reference, mimeType: validated.mimeType, provider };
}

/**
 * The size each slot asks the provider for. Most text-to-image models only
 * accept a fixed set of sizes, so this stays on the values that are widely
 * supported and the caller still fits the result afterwards.
 */
function imageShapeFor(kind, request) {
  const clampSize = (value, fallback) => Math.min(2048, Math.max(512, Number(value) || fallback));
  if (kind === 'pinterest') return { width: clampSize(request.width, 1024), height: clampSize(request.height, 1536) };
  if (kind === 'featured') return { width: clampSize(request.width, 1536), height: clampSize(request.height, 1024) };
  return { width: clampSize(request.width, 1024), height: clampSize(request.height, 1024) };
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
  return transcode.normalizeProviderImage(Buffer.from(encoded, 'base64'));
}

async function generateOpenAiCompatibleImage(settings, prompt, width, height) {
  const endpoint = PublishingContracts.requireHttpsUrl(settings.imageBaseUrl, 'Image API URL');
  const url = endpoint.endsWith('/images/generations') ? endpoint : `${endpoint}/images/generations`;
  const call = (size) => requestJson(url, 'POST', {
    Authorization: `Bearer ${settings.imageApiToken}`,
  }, { model: settings.imageModel || 'gpt-image-1', prompt, size, response_format: 'b64_json' });
  const size = `${width}x${height}`;
  let response;
  try {
    response = await call(size);
  } catch (error) {
    // Plenty of image models only take a handful of sizes (DALL·E 3 offers
    // 1024×1024, 1024×1792, 1792×1024). Fall back to the one size everyone
    // accepts instead of failing the whole generation.
    if (size === '1024x1024') throw error;
    response = await call('1024x1024');
  }
  const item = response.data && response.data[0];
  const encoded = item && (item.b64_json || '');
  if (!encoded) throw new Error('Image provider returned no base64 image.');
  return transcode.normalizeProviderImage(Buffer.from(encoded, 'base64'));
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
  diagnoseWordPress,
  syncPublishedPosts,
  repairPreview,
  repairApply,
  publish,
  assemblePublishedHtml,
  previewArticle,
  publishPinterest,
  generateImage,
  imageShapeFor,
  testImageApi,
  inspectPublishedPost,
  findTrackedPost,
};
