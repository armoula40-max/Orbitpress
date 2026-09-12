'use strict';
process.env.ORBITPRESS_ALLOW_HTTP = '1';
process.env.ORBITPRESS_DATA_DIR = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'orbitpress-test-'));

const test = require('node:test');
const assert = require('node:assert');
const mocks = require('./mockServers');

const wordpress = require('../lib/wordpress');
const imagesLib = require('../lib/images');
const store = require('../lib/store');
const article = require('../lib/article');
const { scanPinterest } = require('../lib/scraper/pinterest');
const analyzer = require('../lib/scraper/analyzer');
const contracts = require('../lib/contracts');

test('WordPress connection diagnostic names the cause instead of a bare 401', async (t) => {
  const wp = await mocks.startWordPressMock();
  t.after(() => wp.server.close());
  const good = 'Basic ' + Buffer.from('admin:app-pass', 'utf8').toString('base64');

  // a healthy site
  store.saveSiteSettings({ wordpressBaseUrl: wp.url, wordpressUsername: 'admin', wordpressAppPassword: 'app-pass' }, 'site-diag');
  const healthy = await wordpress.diagnoseWordPress({ siteId: 'site-diag' });
  assert.equal(healthy.ok, true);
  assert.equal(healthy.accountName, 'Askinz Admin');
  assert.equal(healthy.advertisesAppPasswords, true, 'the REST root advertises application passwords');
  assert.ok(healthy.steps.length >= 3, 'every probe is reported, not just the failure');
  assert.deepEqual(healthy.advice, [], 'a working connection needs no advice');

  // wrong password: WordPress answers exactly like the user saw
  wp.data.expectedAuth = good;
  store.saveSiteSettings({ wordpressBaseUrl: wp.url, wordpressUsername: 'admin', wordpressAppPassword: 'wrong-pass' }, 'site-diag');
  const refused = await wordpress.diagnoseWordPress({ siteId: 'site-diag' });
  assert.equal(refused.ok, false);
  const refusedStep = refused.steps.find((step) => step.url.includes('users/me'));
  assert.equal(refusedStep.status, 401);
  assert.equal(refusedStep.code, 'rest_not_logged_in');
  assert.ok(refused.advice.some((line) => /Application Password/.test(line)), 'the advice names the credential list');
  assert.ok(refused.advice.some((line) => /Authorization/.test(line)), 'and the stripped-header case');

  // right credentials, not enough capability: a different diagnosis
  delete wp.data.expectedAuth;
  wp.data.requireEditContext = true;
  const limited = await wordpress.diagnoseWordPress({ siteId: 'site-diag' });
  assert.equal(limited.ok, false);
  assert.equal(limited.capabilities, true, 'the password is fine, the capability is not');
  assert.ok(limited.advice.some((line) => /صلاحية التحرير/.test(line)));

  // a site that never advertises application passwords (usually: not HTTPS)
  delete wp.data.requireEditContext;
  wp.data.noApplicationPasswords = true;
  const legacy = await wordpress.diagnoseWordPress({ siteId: 'site-diag' });
  assert.equal(legacy.advertisesAppPasswords, false);
  assert.ok(legacy.advice.some((line) => /Application Passwords/.test(line)));
});

test('a blocked users endpoint and a stripped Authorization header are told apart', async (t) => {
  const wp = await mocks.startWordPressMock();
  t.after(() => wp.server.close());
  store.saveSiteSettings({ wordpressBaseUrl: wp.url, wordpressUsername: 'admin', wordpressAppPassword: 'app-pass' }, 'site-shapes');

  // credentials are good, but a security plugin refuses the users endpoint
  wp.data.blockUsersEndpoint = true;
  const blocked = await wordpress.diagnoseWordPress({ siteId: 'site-shapes' });
  assert.equal(blocked.editAccessWorks, true, 'posts?context=edit still answers, so the credentials work');
  assert.ok(blocked.advice.some((line) => /users\/me/.test(line)), 'the advice names the blocked endpoint');
  const connection = await wordpress.testConnection({ siteId: 'site-shapes' });
  assert.equal(connection.ok, true, 'publishing does not depend on the users endpoint');
  assert.equal(connection.usersEndpointBlocked, true);

  // the host drops Authorization but passes X-Authorization through to PHP
  wp.data.blockUsersEndpoint = false;
  wp.data.acceptsAltHeader = true;
  wp.data.expectedAuth = 'Basic ' + Buffer.from('admin:app-pass', 'utf8').toString('base64');
  const stripped = await wordpress.diagnoseWordPress({ siteId: 'site-shapes' });
  assert.equal(stripped.altHeaderWorks, true, 'the alternative header got through');
  assert.ok(stripped.advice.some((line) => /SetEnvIf/.test(line)), 'and the fix for the stripped header is spelled out');
});

test('a refused connection explains itself instead of repeating the raw 401', async (t) => {
  const wp = await mocks.startWordPressMock();
  t.after(() => wp.server.close());
  wp.data.expectedAuth = 'Basic ' + Buffer.from('admin:app-pass', 'utf8').toString('base64');
  store.saveSiteSettings({ wordpressBaseUrl: wp.url, wordpressUsername: 'admin', wordpressAppPassword: 'nope' }, 'site-401');
  await assert.rejects(() => wordpress.testConnection({ siteId: 'site-401' }), /Diagnose WordPress connection/);
});

test('the connection test round-trips and removes a real JPEG through the media endpoint', async (t) => {
  const wp = await mocks.startWordPressMock();
  t.after(() => wp.server.close());
  store.saveSiteSettings({ wordpressBaseUrl: wp.url, wordpressUsername: 'admin', wordpressAppPassword: 'pw' }, 'site-probe');
  const connection = await wordpress.testConnection({ siteId: 'site-probe' });
  assert.equal(connection.uploadsVerified, true, 'media upload capability is part of the test');
  assert.equal(wp.data.uploads.length, 1, 'exactly one probe image was uploaded');
  const [probe] = wp.data.uploads;
  assert.equal(probe.contentType, 'image/jpeg');
  assert.equal(probe.filename, 'orbitpress-connection-test.jpg');
  assert.ok(probe.length > 0 && probe.bytes[0] === 0xff && probe.bytes[1] === 0xd8, 'a genuine JPEG body was sent');
  assert.deepEqual(wp.data.deletions || [], [wp.data.media[0].id], 'the probe attachment was deleted');
});

test('the connection test fails with guidance when the site blocks media uploads', async (t) => {
  const wp = await mocks.startWordPressMock({ rejectImageTypes: ['image/jpeg'] });
  t.after(() => wp.server.close());
  store.saveSiteSettings({ wordpressBaseUrl: wp.url, wordpressUsername: 'admin', wordpressAppPassword: 'pw' }, 'site-probe-blocked');
  let message = '';
  try {
    await wordpress.testConnection({ siteId: 'site-probe-blocked' });
  } catch (error) {
    message = String(error.message || '');
  }
  assert.ok(message, 'the test fails instead of reporting a false success');
  assert.match(message, /standard JPEG/i);
  assert.match(message, /security plugin|firewall|WAF/i);
});

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------

test('image validation enforces the exact Pinterest 2:3 ratio', () => {
  const png23 = mocks.tinyPng(1000, 1500);
  const png11 = mocks.tinyPng(1024, 1024);
  const okImage = imagesLib.parseImage(mocks.makeDataUrl(png23), true, 'site-default');
  assert.equal(okImage.mimeType, 'image/png');
  assert.throws(() => imagesLib.parseImage(mocks.makeDataUrl(png11), true, 'site-default'), /2:3/);
  assert.throws(() => imagesLib.parseImage(mocks.makeDataUrl(Buffer.from('not an image')), false, 'site-default'), /JPEG, PNG, or WebP/);
});

test('storeImage / loadImage / removeImage round trip', () => {
  const buffer = mocks.tinyPng(1000, 1500);
  const stored = imagesLib.storeImage({ kind: 'pinterest', dataUrl: mocks.makeDataUrl(buffer), siteId: 'site-test' });
  assert.ok(stored.reference.startsWith('local://'));
  const loaded = imagesLib.loadImage({ reference: stored.reference, siteId: 'site-test' });
  assert.ok(loaded.dataUrl.startsWith('data:image/png;base64,'));
  imagesLib.removeImage({ reference: stored.reference, siteId: 'site-test' });
  assert.throws(() => imagesLib.loadImage({ reference: stored.reference, siteId: 'site-test' }), /no longer available/);
});

test('settings persist per site with secrets excluded from summaries', () => {
  store.saveSiteSettings({ articleBaseUrl: 'https://ai.example.com/v1', articleModel: 'm1', articleApiKey: 'secret-key', wordpressBaseUrl: 'https://wp.example.com', wordpressUsername: 'admin', wordpressAppPassword: 'app-pw' }, 'site-x');
  const summary = store.getSettingsSummary('site-x');
  assert.equal(summary.articleModel, 'm1');
  assert.equal(summary.articleApiConfigured, true);
  assert.ok(!('articleApiKey' in summary), 'summary must never expose secrets');
  const full = store.getSiteSettings('site-x');
  assert.equal(full.articleApiKey, 'secret-key');
});

// ---------------------------------------------------------------------------

test('WordPress categories + testConnection + publish flow', async (t) => {
  const wp = await mocks.startWordPressMock();
  t.after(() => wp.server.close());
  store.saveSiteSettings({
    wordpressBaseUrl: wp.url,
    wordpressUsername: 'admin',
    wordpressAppPassword: 'pw',
    articleBaseUrl: 'https://ai.example.com/v1',
    articleModel: 'm1',
    articleApiKey: 'k',
    categoryId: '3',
  }, 'site-wp');

  const categories = await wordpress.categories({ siteId: 'site-wp' });
  assert.equal(categories.categories.length, 2);
  assert.deepEqual(categories.categories.map((c) => c.name).sort(), ['Breakfast', 'Chicken']);

  const connection = await wordpress.testConnection({ siteId: 'site-wp' });
  assert.equal(connection.accountName, 'Askinz Admin');

  const draft = contracts.DraftContract.normalize(mocks.sampleArticleJson(), 'Chicken');
  const result = await wordpress.publish({
    siteId: 'site-wp',
    draft: { ...draft, tags: ['wings', 'Air Fryer', 'wings'] },
    images: {
      featured: mocks.makeDataUrl(mocks.tinyPng(1200, 800)),
      pinterest: mocks.makeDataUrl(mocks.tinyPng(1000, 1500)),
    },
    postStatus: 'publish',
  });
  assert.ok(result.url.includes('crispy-air-fryer-chicken-wings'));
  assert.equal(wp.data.posts.length, 1);
  assert.ok(wp.data.posts[0].content.raw.includes('wp-block-image'), 'featured block included');
  assert.ok(wp.data.posts[0].content.raw.includes('data-askinz-pinterest-direct'), 'pinterest button included');
  assert.ok(wp.data.posts[0].content.raw.includes('application/ld+json'), 'schema included');
  assert.equal(wp.data.posts[0].status, 'publish');

  const sync = await wordpress.syncPublishedPosts({ siteId: 'site-wp', drafts: [{ id: 'd1', generationStatus: 'published', slug: 'crispy-air-fryer-chicken-wings' }] });
  assert.equal(sync.posts[0].found, true);

  // repair path: strip the template blocks and let repair restore them
  wp.data.posts[0].content = { raw: '<p>plain content</p>', rendered: '<p>plain content</p>' };
  const preview = await wordpress.repairPreview({ siteId: 'site-wp', drafts: [{ id: 'd1', generationStatus: 'published', slug: 'crispy-air-fryer-chicken-wings', title: 'Wings' }] });
  assert.equal(preview.fixablePosts, 1);
  assert.ok(preview.posts[0].reason.includes('featured image block'));
});

test('duplicate slug publish is blocked', async (t) => {
  const wp = await mocks.startWordPressMock();
  t.after(() => wp.server.close());
  store.saveSiteSettings({ wordpressBaseUrl: wp.url, wordpressUsername: 'a', wordpressAppPassword: 'p', articleBaseUrl: 'https://ai.example.com/v1', articleModel: 'm', articleApiKey: 'k', categoryId: '3' }, 'site-dup');
  wp.data.posts.push({ id: 1, slug: 'crispy-air-fryer-chicken-wings', link: 'https://wp.test/x/', status: 'publish', content: { raw: '', rendered: '' } });
  const draft = contracts.DraftContract.normalize(mocks.sampleArticleJson(), 'Chicken');
  await assert.rejects(
    wordpress.publish({ siteId: 'site-dup', draft, images: { featured: mocks.makeDataUrl(mocks.tinyPng(100, 100)), pinterest: mocks.makeDataUrl(mocks.tinyPng(1000, 1500)) } }),
    /already exists/,
  );
});

// ---------------------------------------------------------------------------

test('article generation normalizes the provider output like Android', async (t) => {
  const api = await mocks.startArticleApiMock();
  t.after(() => api.server.close());
  store.saveSiteSettings({ articleBaseUrl: api.url + '/v1', articleModel: 'gen-x', articleApiKey: 'k', wordpressBaseUrl: 'https://wp.example.com', wordpressUsername: 'a', wordpressAppPassword: 'p' }, 'site-gen');
  const result = await article.generate({ keyword: 'crispy chicken wings', niche: 'food', contentType: 'auto', siteId: 'site-gen' });
  assert.equal(result.ok, true);
  assert.equal(result.draft.contentType, 'recipe');
  assert.ok(result.draft.htmlContent.includes('askinz-recipe-card'));
  assert.ok(result.draft.title.length >= 5);
});

test('article generation falls back when json_schema is unsupported', async (t) => {
  const api = await mocks.startArticleApiMock({ rejectResponseFormat: true });
  t.after(() => api.server.close());
  store.saveSiteSettings({ articleBaseUrl: api.url + '/v1', articleModel: 'gen-x', articleApiKey: 'k', wordpressBaseUrl: 'https://wp.example.com', wordpressUsername: 'a', wordpressAppPassword: 'p' }, 'site-fallback');
  const result = await article.generate({ keyword: 'crispy chicken wings', niche: 'food', siteId: 'site-fallback' });
  assert.equal(result.ok, true);
  assert.ok(api.calls.length >= 2, 'must retry down the compatibility ladder');
  // the final attempt drops response_format entirely (plain salvage mode)
  assert.ok(!('response_format' in api.calls[api.calls.length - 1]), 'last attempt is plain JSON salvage');
});

test('generation recovers when json_schema is refused with wording that lacks the response_format keyword', async (t) => {
  // DeepSeek/OpenRouter-style: rejects strict schema ("Response format ...",
  // with a space) but accepts the json_object mode.
  const api = await mocks.startArticleApiMock({ rejectJsonSchemaOnly: true });
  t.after(() => api.server.close());
  store.saveSiteSettings({ articleBaseUrl: api.url + '/v1', articleModel: 'deepseek-ai/deepseek-v4-flash-0731', articleApiKey: 'k', wordpressBaseUrl: 'https://wp.example.com', wordpressUsername: 'a', wordpressAppPassword: 'p' }, 'site-ds');
  const result = await article.generate({ keyword: 'وصفة تشيز كيك الأوريو', niche: 'حلويات', siteId: 'site-ds' });
  assert.equal(result.ok, true);
  assert.ok(result.draft.htmlContent.includes('askinz-recipe-card'));
  const modes = api.calls.map((c) => (c.response_format ? (c.response_format.type || '?') : 'plain'));
  assert.deepEqual(modes[0], 'json_schema');
  assert.ok(modes.includes('json_object'), 'ladder retries with json_object');
});

test('generation retries with a smaller token budget when the provider caps max_tokens', async (t) => {
  const api = await mocks.startArticleApiMock({ rejectMaxTokens: 8000 });
  t.after(() => api.server.close());
  store.saveSiteSettings({ articleBaseUrl: api.url + '/v1', articleModel: 'gen-x', articleApiKey: 'k', wordpressBaseUrl: 'https://wp.example.com', wordpressUsername: 'a', wordpressAppPassword: 'p' }, 'site-tokens');
  const result = await article.generate({ keyword: 'crispy chicken wings', niche: 'food', siteId: 'site-tokens' });
  assert.equal(result.ok, true);
  assert.ok(api.calls.at(-1).max_tokens <= 8000, 'the successful call used the provider token cap');
  assert.ok(api.calls.some((c) => c.max_tokens === 12000), 'the first attempt used the standard budget');
});

// ---------------------------------------------------------------------------

test('the image reaches WordPress as raw bytes with its own content type', async (t) => {
  const wp = await mocks.startWordPressMock();
  t.after(() => wp.server.close());
  store.saveSiteSettings({ wordpressBaseUrl: wp.url, wordpressUsername: 'a', wordpressAppPassword: 'p', articleBaseUrl: 'https://ai.example.com/v1', articleModel: 'm', articleApiKey: 'k', categoryId: '3' }, 'site-bytes');
  const featured = mocks.tinyPng(1200, 800);
  const pinterest = mocks.tinyPng(1000, 1500);
  const draft = contracts.DraftContract.normalize(mocks.sampleArticleJson(), 'Chicken');
  await wordpress.publish({
    siteId: 'site-bytes',
    draft,
    images: { featured: mocks.makeDataUrl(featured), pinterest: mocks.makeDataUrl(pinterest) },
    postStatus: 'draft',
  });
  assert.equal(wp.data.uploads.length, 2, 'featured and pinterest images uploaded');
  const [first, second] = wp.data.uploads;
  // requestJson() used to JSON-encode the bytes and force application/json,
  // which WordPress answers with rest_upload_sideload_error.
  assert.equal(first.contentType, 'image/png');
  assert.ok(first.bytes.equals(featured), 'WordPress receives the exact image bytes');
  assert.equal(first.filename, 'crispy-air-fryer-chicken-wings-featured.png');
  assert.equal(second.contentType, 'image/png');
  assert.ok(second.bytes.equals(pinterest), 'the Pinterest image arrives intact too');
  assert.equal(second.filename, 'crispy-air-fryer-chicken-wings-pinterest.png');
});

test('a site that refuses PNG still publishes via an automatic JPEG retry', async (t) => {
  const wp = await mocks.startWordPressMock({ rejectImageTypes: ['image/png'] });
  t.after(() => wp.server.close());
  store.saveSiteSettings({ wordpressBaseUrl: wp.url, wordpressUsername: 'a', wordpressAppPassword: 'p', articleBaseUrl: 'https://ai.example.com/v1', articleModel: 'm', articleApiKey: 'k', categoryId: '3' }, 'site-mime');
  const featuredPng = await mocks.realImage('png', 1200, 800);
  const pinterestPng = await mocks.realImage('png', 1000, 1500);
  const draft = contracts.DraftContract.normalize(mocks.sampleArticleJson(), 'Chicken');
  const result = await wordpress.publish({
    siteId: 'site-mime',
    draft,
    images: { featured: mocks.makeDataUrl(featuredPng, 'image/png'), pinterest: mocks.makeDataUrl(pinterestPng, 'image/png') },
    postStatus: 'draft',
  });
  assert.ok(result.url, 'publish succeeds after retrying the refused PNG as JPEG');
  // Each image was first sent as PNG (refused) then retried as standard JPEG.
  const contentTypes = wp.data.uploads.map((u) => u.contentType);
  assert.deepEqual([...contentTypes].sort(), ['image/jpeg', 'image/jpeg', 'image/png', 'image/png']);
  assert.ok(wp.data.uploads.every((u) => /^[\x20-\x7e]+\.(jpg|png)$/.test(u.filename)));
});

test('WebP is sent to WordPress as JPEG without ever attempting a WebP upload', async (t) => {
  const wp = await mocks.startWordPressMock({ rejectImageTypes: ['image/webp'] });
  t.after(() => wp.server.close());
  store.saveSiteSettings({ wordpressBaseUrl: wp.url, wordpressUsername: 'a', wordpressAppPassword: 'p', articleBaseUrl: 'https://ai.example.com/v1', articleModel: 'm', articleApiKey: 'k', categoryId: '3' }, 'site-webp');
  const featured = await mocks.realImage('webp', 1200, 800);
  const pinterest = await mocks.realImage('webp', 1000, 1500);
  const draft = contracts.DraftContract.normalize(mocks.sampleArticleJson(), 'Chicken');
  const result = await wordpress.publish({
    siteId: 'site-webp',
    draft,
    images: { featured: mocks.makeDataUrl(featured, 'image/webp'), pinterest: mocks.makeDataUrl(pinterest, 'image/webp') },
    postStatus: 'draft',
  });
  assert.ok(result.url, 'publishing the WebP pair succeeds');
  assert.equal(wp.data.uploads.length, 2, 'no failed WebP attempt is retried — it was normalized first');
  for (const upload of wp.data.uploads) {
    assert.equal(upload.contentType, 'image/jpeg', `${upload.filename} reaches WordPress as JPEG`);
    assert.match(upload.filename, /\.jpg$/, `${upload.filename} carries a .jpg name`);
    assert.equal(upload.bytes[0], 0xff, 'real JPEG magic bytes');
    assert.equal(upload.bytes[1], 0xd8);
  }
});

test('a site that refuses even JPEG gets firewall guidance, not a raw 500', async (t) => {
  const wp = await mocks.startWordPressMock({ rejectImageTypes: ['image/png', 'image/jpeg', 'image/webp'] });
  t.after(() => wp.server.close());
  store.saveSiteSettings({ wordpressBaseUrl: wp.url, wordpressUsername: 'a', wordpressAppPassword: 'p', articleBaseUrl: 'https://ai.example.com/v1', articleModel: 'm', articleApiKey: 'k', categoryId: '3' }, 'site-mime2');
  const featured = await mocks.realImage('webp', 1200, 800);
  const pinterest = await mocks.realImage('webp', 1000, 1500);
  const draft = contracts.DraftContract.normalize(mocks.sampleArticleJson(), 'Chicken');
  let message = '';
  try {
    await wordpress.publish({
      siteId: 'site-mime2',
      draft,
      images: { featured: mocks.makeDataUrl(featured, 'image/webp'), pinterest: mocks.makeDataUrl(pinterest, 'image/webp') },
      postStatus: 'draft',
    });
  } catch (error) {
    message = String(error.message || '');
  }
  assert.ok(message, 'publishing failed instead of silently skipping the image');
  assert.match(message, /standard JPEG/i, 'the message notes the format was already JPEG');
  assert.match(message, /security plugin|firewall|WAF/i, 'the message names the likely firewall cause');
  assert.match(message, /wp-admin/i, 'the message points at the manual Media upload check');
  assert.doesNotMatch(message, /^Request failed \(500\)/, 'the raw WordPress 500 is not what the user reads');
});

test('publishing a Pin uses the signed-in session, not an API token', async (t) => {
  const mock = await mocks.startPinterestPublishMock();
  t.after(() => mock.server.close());
  const savedHosts = process.env.ORBITPRESS_PINTEREST_HOSTS;
  process.env.ORBITPRESS_PINTEREST_HOSTS = mock.url;
  t.after(() => {
    if (savedHosts == null) delete process.env.ORBITPRESS_PINTEREST_HOSTS;
    else process.env.ORBITPRESS_PINTEREST_HOSTS = savedHosts;
  });

  const sessions = require('../lib/scraper/sessions');
  const publisher = require('../lib/scraper/pinterestPublish');
  const originalCookie = sessions.cookieHeader;
  const AUTHED_COOKIE = 'csrftoken=abc123; _pinterest_sess=fake; _auth=1';
  sessions.cookieHeader = async () => AUTHED_COOKIE;
  t.after(() => { sessions.cookieHeader = originalCookie; });

  // a board URL is resolved to its numeric id first
  const boardId = await publisher.resolveBoardId('csrftoken=abc123', 'https://www.pinterest.com/mockuser/recipes/');
  assert.equal(boardId, '112233445566778899');

  const result = await publisher.publishPinWithSession({
    boardId: 'https://www.pinterest.com/mockuser/recipes/',
    title: 'Test Pin',
    description: 'A test description',
    link: 'https://example.test/post',
    image: { bytes: mocks.tinyPng(1000, 1500), mimeType: 'image/png' },
    altText: 'test alt',
  });
  assert.equal(result.ok, true, result.message);
  assert.equal(result.pinId, '987654321098765432');
  assert.equal(result.pinUrl, 'https://www.pinterest.com/pin/987654321098765432/');
  const paths = mock.paths();
  for (const expected of ['/resource/ApiResource/create/', '/s3-upload', '/resource/VIPResource/get/', '/resource/PinResource/create/']) {
    assert.ok(paths.includes(expected), `the current S3 upload flow calls ${expected}`);
  }
  // bytes were posted to S3 as the multipart "file" field
  const s3Record = mock.bodies.find((b) => b.s3Upload);
  assert.ok(s3Record && s3Record.s3Upload.hasFile, 'image bytes were PUT to the presigned S3 form');
  // the pin was created from the registered upload, not a scraped image URL
  const create = mock.bodies.find((b) => b.options && b.options.upload_id);
  assert.equal(create.options.upload_id, 777001);
  assert.equal(create.options.image_signature, 'imagesig-777001');
  assert.equal(create.options.method, 'uploaded');
});

test('a real Pinterest session that never received the _auth cookie still publishes (functional canary)', async (t) => {
  // Some accounts/regions are fully logged in but never get `_auth=1`; the old
  // name-based gate downgraded those valid sessions. The canary is now the
  // site's own UserResource/get XHR.
  const mock = await mocks.startPinterestPublishMock();
  t.after(() => mock.server.close());
  const savedHosts = process.env.ORBITPRESS_PINTEREST_HOSTS;
  process.env.ORBITPRESS_PINTEREST_HOSTS = mock.url;
  t.after(() => {
    if (savedHosts == null) delete process.env.ORBITPRESS_PINTEREST_HOSTS;
    else process.env.ORBITPRESS_PINTEREST_HOSTS = savedHosts;
  });
  const sessions = require('../lib/scraper/sessions');
  const publisher = require('../lib/scraper/pinterestPublish');
  const originalCookie = sessions.cookieHeader;
  sessions.cookieHeader = async () => 'csrftoken=abc123; _pinterest_sess=valid-no-auth-cookie';
  t.after(() => { sessions.cookieHeader = originalCookie; });

  const result = await publisher.publishPinWithSession({
    boardId: '112233445566778899',
    title: 'No Auth Cookie Pin',
    description: 'x',
    link: 'https://example.test/post',
    image: { bytes: mocks.tinyPng(1000, 1500), mimeType: 'image/png' },
    altText: 'x',
  });
  assert.equal(result.ok, true, result.message);
  assert.ok(mock.paths().includes('/resource/BoardPickerBoardsResource/get/'), 'the session is proven by the account boards picker');
  assert.ok(mock.paths().includes('/resource/PinResource/create/'));
});

test('a guest/expired Pinterest jar is caught when the account boards answer auth code 2', async (t) => {
  // Pinterest keeps _pinterest_sess present even when logged out; the real
  // proof is the account's board listing (the same call the picker uses).
  const mock = await mocks.startPinterestPublishMock({ failStage: 'boards-auth' });
  t.after(() => mock.server.close());
  const savedHosts = process.env.ORBITPRESS_PINTEREST_HOSTS;
  process.env.ORBITPRESS_PINTEREST_HOSTS = mock.url;
  t.after(() => {
    if (savedHosts == null) delete process.env.ORBITPRESS_PINTEREST_HOSTS;
    else process.env.ORBITPRESS_PINTEREST_HOSTS = savedHosts;
  });
  const sessions = require('../lib/scraper/sessions');
  const publisher = require('../lib/scraper/pinterestPublish');
  const originalCookie = sessions.cookieHeader;
  sessions.cookieHeader = async () => 'csrftoken=abc123; _pinterest_sess=guest-jar';
  t.after(() => { sessions.cookieHeader = originalCookie; });

  const result = await publisher.publishPinWithSession({
    boardId: '112233445566778899',
    title: 'Test Pin',
    description: 'x',
    link: 'https://example.test/post',
    image: { bytes: mocks.tinyPng(1000, 1500), mimeType: 'image/png' },
    altText: 'x',
  });
  assert.equal(result.ok, false);
  assert.equal(result.stage, 'session');
  assert.match(result.message, /قطع الاتصال/);
  assert.match(result.message, /كود 2|code 2/i);
  assert.ok(!mock.paths().includes('/resource/ApiResource/create/'), 'no upload is registered for a guest jar');
  assert.ok(!mock.paths().includes('/s3-upload'), 'no S3 upload happens for a guest jar');
});

test('an expired Pinterest session (register answers auth code 2) returns re-login guidance', async (t) => {
  const mock = await mocks.startPinterestPublishMock({ failStage: 'register-auth' });
  t.after(() => mock.server.close());
  const savedHosts = process.env.ORBITPRESS_PINTEREST_HOSTS;
  process.env.ORBITPRESS_PINTEREST_HOSTS = mock.url;
  t.after(() => {
    if (savedHosts == null) delete process.env.ORBITPRESS_PINTEREST_HOSTS;
    else process.env.ORBITPRESS_PINTEREST_HOSTS = savedHosts;
  });
  const sessions = require('../lib/scraper/sessions');
  const publisher = require('../lib/scraper/pinterestPublish');
  const originalCookie = sessions.cookieHeader;
  sessions.cookieHeader = async () => 'csrftoken=abc123; _pinterest_sess=stale; _auth=1';
  t.after(() => { sessions.cookieHeader = originalCookie; });

  const result = await publisher.publishPinWithSession({
    boardId: '112233445566778899',
    title: 'Test Pin',
    description: 'x',
    link: 'https://example.test/post',
    image: { bytes: mocks.tinyPng(1000, 1500), mimeType: 'image/png' },
    altText: 'x',
  });
  assert.equal(result.ok, false);
  assert.equal(result.stage, 'session', result.message);
  assert.match(result.message, /كود 2|code 2/i);
  assert.match(result.message, /قطع الاتصال/);
  assert.ok(!mock.paths().includes('/s3-upload'), 'nothing is uploaded after an auth failure');
});

test('a created pin missing its destination link gets it set via PinResource/update', async (t) => {
  const mock = await mocks.startPinterestPublishMock();
  t.after(() => mock.server.close());
  const savedHosts = process.env.ORBITPRESS_PINTEREST_HOSTS;
  process.env.ORBITPRESS_PINTEREST_HOSTS = mock.url;
  t.after(() => {
    if (savedHosts == null) delete process.env.ORBITPRESS_PINTEREST_HOSTS;
    else process.env.ORBITPRESS_PINTEREST_HOSTS = savedHosts;
  });
  const sessions = require('../lib/scraper/sessions');
  const publisher = require('../lib/scraper/pinterestPublish');
  const originalCookie = sessions.cookieHeader;
  sessions.cookieHeader = async () => 'csrftoken=abc123; _pinterest_sess=fake; _auth=1';
  t.after(() => { sessions.cookieHeader = originalCookie; });

  const result = await publisher.publishPinWithSession({
    boardId: '112233445566778899',
    title: 'Bread Pin',
    description: 'x',
    link: 'https://askinz.test/sourdough-bread/',
    image: { bytes: mocks.tinyPng(1000, 1500), mimeType: 'image/png' },
    altText: 'x',
  });
  assert.equal(result.ok, true, result.message);
  assert.ok(mock.paths().includes('/resource/PinResource/update/'), 'the link is repaired with PinResource/update');
  const update = mock.bodies.find((b) => b.options && b.options.link && b.options.id);
  assert.equal(update.options.link, 'https://askinz.test/sourdough-bread/');
  assert.equal(update.options.id, '987654321098765432');
});

test('a created pin already carrying the destination link is not updated twice', async (t) => {
  const mock = await mocks.startPinterestPublishMock({ pinAttachedLink: 'https://askinz.test/sourdough-bread/' });
  t.after(() => mock.server.close());
  const savedHosts = process.env.ORBITPRESS_PINTEREST_HOSTS;
  process.env.ORBITPRESS_PINTEREST_HOSTS = mock.url;
  t.after(() => {
    if (savedHosts == null) delete process.env.ORBITPRESS_PINTEREST_HOSTS;
    else process.env.ORBITPRESS_PINTEREST_HOSTS = savedHosts;
  });
  const sessions = require('../lib/scraper/sessions');
  const publisher = require('../lib/scraper/pinterestPublish');
  const originalCookie = sessions.cookieHeader;
  sessions.cookieHeader = async () => 'csrftoken=abc123; _pinterest_sess=fake; _auth=1';
  t.after(() => { sessions.cookieHeader = originalCookie; });

  const result = await publisher.publishPinWithSession({
    boardId: '112233445566778899',
    title: 'Bread Pin',
    description: 'x',
    link: 'https://askinz.test/sourdough-bread',
    image: { bytes: mocks.tinyPng(1000, 1500), mimeType: 'image/png' },
    altText: 'x',
  });
  assert.equal(result.ok, true, result.message);
  assert.ok(!mock.paths().includes('/resource/PinResource/update/'), 'no update when the link already matches (trailing-slash tolerant)');
});

test('when the S3 upload stage is unavailable, the legacy /upload-image/ flow still publishes', async (t) => {
  const mock = await mocks.startPinterestPublishMock({ failStage: 's3' });
  t.after(() => mock.server.close());
  const savedHosts = process.env.ORBITPRESS_PINTEREST_HOSTS;
  process.env.ORBITPRESS_PINTEREST_HOSTS = mock.url;
  t.after(() => {
    if (savedHosts == null) delete process.env.ORBITPRESS_PINTEREST_HOSTS;
    else process.env.ORBITPRESS_PINTEREST_HOSTS = savedHosts;
  });
  const sessions = require('../lib/scraper/sessions');
  const publisher = require('../lib/scraper/pinterestPublish');
  const originalCookie = sessions.cookieHeader;
  sessions.cookieHeader = async () => 'csrftoken=abc123; _pinterest_sess=fake; _auth=1';
  t.after(() => { sessions.cookieHeader = originalCookie; });

  const result = await publisher.publishPinWithSession({
    boardId: '112233445566778899',
    title: 'Legacy Pin',
    description: 'fallback',
    link: 'https://example.test/post',
    image: { bytes: mocks.tinyPng(1000, 1500), mimeType: 'image/png' },
    altText: 'x',
  });
  assert.equal(result.ok, true, result.message);
  assert.equal(result.pinId, '987654321098765432');
  assert.ok(mock.paths().includes('/upload-image/'), 'the legacy endpoint was tried as the fallback');
  const legacyCreate = mock.bodies.find((b) => b.options && b.options.image_url);
  assert.equal(legacyCreate.options.image_url, 'https://i.pinimg.com/uploaded/legacy.jpg');
});

test('the board picker endpoint path lists the connected account boards with ids and URLs', async (t) => {
  const mock = await mocks.startPinterestPublishMock();
  t.after(() => mock.server.close());
  const savedHosts = process.env.ORBITPRESS_PINTEREST_HOSTS;
  process.env.ORBITPRESS_PINTEREST_HOSTS = mock.url;
  t.after(() => {
    if (savedHosts == null) delete process.env.ORBITPRESS_PINTEREST_HOSTS;
    else process.env.ORBITPRESS_PINTEREST_HOSTS = savedHosts;
  });
  const sessions = require('../lib/scraper/sessions');
  const publisher = require('../lib/scraper/pinterestPublish');
  const originalCookie = sessions.cookieHeader;
  sessions.cookieHeader = async () => 'csrftoken=abc123; _pinterest_sess=fake; _auth=1';
  t.after(() => { sessions.cookieHeader = originalCookie; });

  const me = await publisher.sessionAlive(publisher.hosts(), 'csrftoken=abc123; _pinterest_sess=fake');
  assert.equal(me, 'armoula40');
  const listed = await publisher.listMyBoards(publisher.hosts(), 'csrftoken=abc123; _pinterest_sess=fake', me);
  assert.equal(listed.ok, true);
  assert.equal(listed.boards.length, 3);
  const bread = listed.boards.find((b) => b.name === 'Sourdough easy recipes');
  assert.equal(bread.id, '777888999000111222');
  assert.equal(bread.slug, 'sourdough-easy-recipes');
});

test('a board URL carrying the wrong username resolves through the connected account board list', async (t) => {
  const mock = await mocks.startPinterestPublishMock({ failStage: 'board-missing' });
  t.after(() => mock.server.close());
  const savedHosts = process.env.ORBITPRESS_PINTEREST_HOSTS;
  process.env.ORBITPRESS_PINTEREST_HOSTS = mock.url;
  t.after(() => {
    if (savedHosts == null) delete process.env.ORBITPRESS_PINTEREST_HOSTS;
    else process.env.ORBITPRESS_PINTEREST_HOSTS = savedHosts;
  });
  const sessions = require('../lib/scraper/sessions');
  const publisher = require('../lib/scraper/pinterestPublish');
  const originalCookie = sessions.cookieHeader;
  sessions.cookieHeader = async () => 'csrftoken=abc123; _pinterest_sess=fake; _auth=1';
  t.after(() => { sessions.cookieHeader = originalCookie; });

  // username "otherperson" is wrong, but the slug matches an owned board
  const result = await publisher.publishPinWithSession({
    boardId: 'https://www.pinterest.com/otherperson/sourdough-easy-recipes/',
    title: 'Bread Pin',
    description: 'x',
    link: 'https://example.test/post',
    image: { bytes: mocks.tinyPng(1000, 1500), mimeType: 'image/png' },
    altText: 'x',
  });
  assert.equal(result.ok, true, result.message);
  const create = mock.bodies.find((b) => b.options && b.options.upload_id);
  assert.equal(create.options.board_id, '777888999000111222', 'the owned board id was used');
});

test('a pasted board name (including Arabic) matches an owned board and publishes', async (t) => {
  const mock = await mocks.startPinterestPublishMock({ failStage: 'board-missing' });
  t.after(() => mock.server.close());
  const savedHosts = process.env.ORBITPRESS_PINTEREST_HOSTS;
  process.env.ORBITPRESS_PINTEREST_HOSTS = mock.url;
  t.after(() => {
    if (savedHosts == null) delete process.env.ORBITPRESS_PINTEREST_HOSTS;
    else process.env.ORBITPRESS_PINTEREST_HOSTS = savedHosts;
  });
  const sessions = require('../lib/scraper/sessions');
  const publisher = require('../lib/scraper/pinterestPublish');
  const originalCookie = sessions.cookieHeader;
  sessions.cookieHeader = async () => 'csrftoken=abc123; _pinterest_sess=fake; _auth=1';
  t.after(() => { sessions.cookieHeader = originalCookie; });

  const direct = await publisher.resolveBoardId('csrftoken=abc123', 'Sourdough easy recipes');
  assert.equal(direct, '777888999000111222');
  const arabic = await publisher.resolveBoardId('csrftoken=abc123', 'لوحات أفكار');
  assert.equal(arabic, '333444555666777888');
});

test('an unknown board lists the owned boards in the Arabic error and never falls through to the token API', async (t) => {
  const publishMock = await mocks.startPinterestPublishMock({ failStage: 'board-missing' });
  t.after(() => publishMock.server.close());
  const api = await mocks.startPinterestApiMock();
  t.after(() => api.server.close());
  const savedHosts = process.env.ORBITPRESS_PINTEREST_HOSTS;
  const savedBase = process.env.ORBITPRESS_PINTEREST_API_BASE;
  process.env.ORBITPRESS_PINTEREST_HOSTS = publishMock.url;
  process.env.ORBITPRESS_PINTEREST_API_BASE = api.url;
  t.after(() => {
    if (savedHosts == null) delete process.env.ORBITPRESS_PINTEREST_HOSTS;
    else process.env.ORBITPRESS_PINTEREST_HOSTS = savedHosts;
    if (savedBase == null) delete process.env.ORBITPRESS_PINTEREST_API_BASE;
    else process.env.ORBITPRESS_PINTEREST_API_BASE = savedBase;
  });
  const sessions = require('../lib/scraper/sessions');
  const originalCookie = sessions.cookieHeader;
  sessions.cookieHeader = async () => 'csrftoken=abc123; _pinterest_sess=fake; _auth=1';
  t.after(() => { sessions.cookieHeader = originalCookie; });

  store.saveSiteSettings({ pinterestAccessToken: 'trial-app-token', pinterestBoardId: 'https://www.pinterest.com/armoula40/does-not-exist/' }, 'site-board-miss');
  let message = '';
  try {
    await wordpress.publishPinterest({
      siteId: 'site-board-miss',
      link: 'https://example.test/post',
      image: mocks.makeDataUrl(mocks.tinyPng(1000, 1500)),
      draft: { title: 'Test Pin' },
    });
  } catch (error) {
    message = String(error.message || '');
  }
  assert.match(message, /تعذّر العثور على اللوحة/);
  assert.match(message, /sourdough-easy-recipes/, 'owned boards are listed to pick from');
  assert.match(message, /armoula40/, 'the connected username is shown');
  assert.equal(api.calls.length, 0, 'a board-stage session failure never calls the v5 token API');
});

test('an unapproved Pinterest app (API code 3) points at the server session path', async (t) => {
  const api = await mocks.startPinterestApiMock();
  t.after(() => api.server.close());
  const savedBase = process.env.ORBITPRESS_PINTEREST_API_BASE;
  process.env.ORBITPRESS_PINTEREST_API_BASE = api.url;
  t.after(() => {
    if (savedBase == null) delete process.env.ORBITPRESS_PINTEREST_API_BASE;
    else process.env.ORBITPRESS_PINTEREST_API_BASE = savedBase;
  });
  const sessions = require('../lib/scraper/sessions');
  const originalCookie = sessions.cookieHeader;
  // No browser session connected: publishPinWithSession returns stage 'session'.
  sessions.cookieHeader = async () => '';
  t.after(() => { sessions.cookieHeader = originalCookie; });

  store.saveSiteSettings({ pinterestAccessToken: 'trial-app-token', pinterestBoardId: '112233445566778899' }, 'site-pin-code3');
  let message = '';
  try {
    await wordpress.publishPinterest({
      siteId: 'site-pin-code3',
      link: 'https://example.test/post',
      image: mocks.makeDataUrl(mocks.tinyPng(1000, 1500)),
      draft: { title: 'Test Pin' },
    });
  } catch (error) {
    message = String(error.message || '');
  }
  assert.ok(message, 'the pin call fails instead of swallowing the 401');
  assert.match(message, /consumer type is not supported|الكود 3/);
  assert.match(message, /Trial access pending/i);
  assert.match(message, /الحسابات المرتبطة/, 'the message names the settings card to connect the session');
  assert.equal(api.calls.length, 1, 'the token endpoint was tried once as the fallback');
  assert.equal(api.calls[0].path, '/v5/pins');
});

test('an invalid Pinterest token is explained rather than echoed as a raw 401', async (t) => {
  const api = await mocks.startPinterestApiMock({ status: 401, payload: { code: 2, message: 'Authentication failed.' } });
  t.after(() => api.server.close());
  const savedBase = process.env.ORBITPRESS_PINTEREST_API_BASE;
  process.env.ORBITPRESS_PINTEREST_API_BASE = api.url;
  t.after(() => {
    if (savedBase == null) delete process.env.ORBITPRESS_PINTEREST_API_BASE;
    else process.env.ORBITPRESS_PINTEREST_API_BASE = savedBase;
  });
  const sessions = require('../lib/scraper/sessions');
  const originalCookie = sessions.cookieHeader;
  sessions.cookieHeader = async () => '';
  t.after(() => { sessions.cookieHeader = originalCookie; });

  store.saveSiteSettings({ pinterestAccessToken: 'bad-token', pinterestBoardId: '112233445566778899' }, 'site-pin-code2');
  let message = '';
  try {
    await wordpress.publishPinterest({
      siteId: 'site-pin-code2',
      link: 'https://example.test/post',
      image: mocks.makeDataUrl(mocks.tinyPng(1000, 1500)),
      draft: { title: 'Test Pin' },
    });
  } catch (error) {
    message = String(error.message || '');
  }
  assert.match(message, /رمز الوصول|boards:write/);
  assert.match(message, /الحسابات المرتبطة/);
});

test('an approved Pinterest token publishes through the v5 API fallback', async (t) => {
  const api = await mocks.startPinterestApiMock({ success: true });
  t.after(() => api.server.close());
  const savedBase = process.env.ORBITPRESS_PINTEREST_API_BASE;
  process.env.ORBITPRESS_PINTEREST_API_BASE = api.url;
  t.after(() => {
    if (savedBase == null) delete process.env.ORBITPRESS_PINTEREST_API_BASE;
    else process.env.ORBITPRESS_PINTEREST_API_BASE = savedBase;
  });
  const sessions = require('../lib/scraper/sessions');
  const originalCookie = sessions.cookieHeader;
  sessions.cookieHeader = async () => '';
  t.after(() => { sessions.cookieHeader = originalCookie; });

  store.saveSiteSettings({ pinterestAccessToken: 'approved-token', pinterestBoardId: '112233445566778899' }, 'site-pin-ok');
  const result = await wordpress.publishPinterest({
    siteId: 'site-pin-ok',
    link: 'https://example.test/post',
    image: mocks.makeDataUrl(mocks.tinyPng(1000, 1500)),
    draft: { title: 'Test Pin' },
  });
  assert.equal(result.ok, true);
  assert.equal(result.method, 'api-token');
  assert.equal(result.id, '99887766554433221');
  assert.equal(api.calls.length, 1);
  assert.equal(api.calls[0].authorization, 'Bearer approved-token');
  assert.equal(api.calls[0].body.board_id, '112233445566778899');
  assert.equal(api.calls[0].body.media_source.source_type, 'image_base64');
});

// --- pin studio: the pin is drawn in the browser, its maths is tested here --

/** Minimal stand-in for a canvas 2D context: ~0.55 em per character. */
function fakePinContext(perChar = 0.55) {
  return {
    font: '',
    measureText(text) {
      const size = Number(String(this.font).match(/(\d+)px/)?.[1] || 16);
      return { width: String(text).length * size * perChar };
    },
  };
}

test('pin layout keeps every text box inside the 1000 × 1500 canvas', () => {
  const pin = require('../public/app/pinStudio.js');
  for (const template of ['scrim', 'card', 'top']) {
    const box = pin.layout({ template, chips: ['25 min prep', 'Serves 4'] }, pin.PIN_SIZE);
    assert.deepEqual(box.size, { width: 1000, height: 1500 });
    for (const part of ['chips', 'headline', 'subline', 'footer']) {
      const rect = box[part];
      assert.ok(rect.y >= 0, `${template}/${part} starts inside the canvas`);
      assert.ok(rect.y + rect.height <= box.size.height, `${template}/${part} ends inside the canvas`);
      assert.ok(rect.x >= 0 && rect.x + rect.width <= box.size.width, `${template}/${part} stays inside the width`);
    }
    assert.ok(box.headline.y + box.headline.height <= box.footer.y + 1, `${template} headline sits above the footer`);
  }
});

test('pin cover crop fills the canvas and stays centred', () => {
  const pin = require('../public/app/pinStudio.js');
  const rect = pin.coverRect(1200, 800, 1000, 1500, 0.5);
  assert.ok(rect.width >= 1000 && rect.height >= 1500, 'a landscape photo is scaled to cover, never letterboxed');
  assert.equal(rect.x, (1000 - rect.width) / 2);
  assert.equal(rect.y, 0);
  assert.deepEqual(pin.coverRect(0, 0, 1000, 1500, 0.5), { x: 0, y: 0, width: 1000, height: 1500 });
});

test('pin headline wraps and shrinks instead of overflowing', () => {
  const pin = require('../public/app/pinStudio.js');
  const ctx = fakePinContext();
  const lines = pin.wrapLines('Easy Sourdough Bread For Beginners', (text) => text.length * 10, 100);
  assert.deepEqual(lines.join(' '), 'Easy Sourdough Bread For Beginners');
  assert.ok(lines.every((line) => line.length * 10 <= 100));

  const long = 'Crispy Air Fryer Chicken Wings With Honey Garlic Sauce';
  const fitted = pin.fitText(ctx, long, {
    maxWidth: 840, maxHeight: 205, max: 105, min: 50, weight: 800, family: 'sans', lineHeightRatio: 1.06, maxLines: 4,
  });
  assert.ok(fitted.size < 105, 'a long headline gives up size rather than clipping');
  assert.ok(fitted.lines.length * fitted.lineHeight <= 205);
  assert.ok(fitted.lines.every((line) => line.length * fitted.size * 0.55 <= 841));
  const short = pin.fitText(ctx, 'Bread', {
    maxWidth: 840, maxHeight: 205, max: 105, min: 50, weight: 800, family: 'sans', lineHeightRatio: 1.06, maxLines: 4,
  });
  assert.equal(short.size, 105, 'a short headline keeps the full size');
});

test('pin defaults carry the recipe facts and the site domain', () => {
  const pin = require('../public/app/pinStudio.js');
  const design = pin.defaultDesign({
    title: 'Sourdough Bread | Askinz',
    metaDescription: 'A simple loaf with four ingredients.',
    contentType: 'recipe',
    recipe: { prepTime: '20 min', cookTime: '40 min', recipeYield: '8 slices' },
    publishedUrl: 'https://www.askinz.com/sourdough-bread/',
  });
  assert.deepEqual(design.chips, ['20 min prep', '40 min cook', 'Serves 8 slices']);
  assert.equal(design.brand, 'askinz.com');
  assert.equal(design.headline, 'Sourdough Bread');
  assert.equal(design.cta, 'Full recipe');
  const text = pin.pinText(design, { title: 'Sourdough Bread | Askinz' });
  assert.equal(text.title, 'Sourdough Bread');
  assert.ok(text.description.includes('20 min prep'));
  assert.ok(text.description.includes('askinz.com'));
  assert.ok(text.description.length <= 800);
});

test('pro pin templates compose photo slots, palettes and Arabic defaults', () => {
  const pin = require('../public/app/pinStudio.js');
  assert.deepEqual(pin.CLASSIC_TEMPLATES, ['scrim', 'card', 'top']);
  assert.ok(pin.PRO_TEMPLATES.includes('ways') && pin.PRO_TEMPLATES.includes('listicle'));
  assert.ok(pin.PALETTES.pumpkin && pin.PALETTES.terracotta, 'curated palettes ship with the studio');

  const context = {
    title: '4 وصفات باليقطين', metaDescription: 'وصفات خريفية', contentType: 'recipe',
    recipes: [
      { title: 'قهوة اليقطين', ingredients: ['قهوة', 'حليب', 'يقطين'], instructions: [{ text: 'اخلطي القهوة مع اليقطين' }, { text: 'سخّني الحليب' }, { text: 'اجمعي المكونات' }, { text: 'قدّميها ساخنة' }] },
      { title: 'كعكة', ingredients: ['دقيق', 'سكر'] },
      { title: 'حساء' },
      { title: 'فطيرة' },
    ],
  };
  const ways = pin.defaultDesign(context, 'ways');
  assert.equal(ways.photos.length, 4, 'one slot per roundup recipe');
  assert.equal(ways.photos[0].label, 'قهوة اليقطين');
  assert.equal(ways.photos[0].ingredients.length, 3);
  assert.equal(ways.cta, 'احفظي الوصفة', 'Arabic articles get Arabic CTA');
  assert.equal(ways.palette, 'pumpkin');

  const layout4 = pin.proLayout('ways', pin.PIN_SIZE, 4);
  assert.equal(layout4.cards.length, 4);
  assert.equal(layout4.cards.filter((c) => c.width > 400).length, 4, '2x2 grid cards are large enough for readability');
  layout4.cards.forEach((c) => {
    assert.ok(c.x >= 0 && c.y >= 0 && c.x + c.width <= 1000 && c.y + c.height <= 1500, 'ways cards stay on canvas');
  });
  assert.equal(pin.proLayout('ways', pin.PIN_SIZE, 3).cards.length, 3);
  assert.equal(pin.proLayout('ways', pin.PIN_SIZE, 2).cards.length, 2, 'a two-recipe roundup uses two full rows');

  const checklist = pin.defaultDesign({
    title: 'Chicken Tikka Patties', contentType: 'recipe',
    recipe: { ingredients: ['chicken', 'spices', 'yogurt', 'onions'] },
  }, 'checklist');
  assert.equal(checklist.photos.length, 1);
  assert.equal(checklist.photos[0].ingredients.length, 4);
  const checkLayout = pin.proLayout('checklist', pin.PIN_SIZE, 1);
  assert.ok(checkLayout.paper.width <= 1000 && checkLayout.paper.y + checkLayout.paper.height <= 1500);

  assert.equal(pin.defaultDesign(context, 'duo').photos.length, 2);
  assert.equal(pin.defaultDesign(context, 'banner').photos.length, 1);

  // four extra pro templates: listicle, steps, quote, circle
  assert.deepEqual(pin.PRO_TEMPLATES, ['ways', 'checklist', 'banner', 'duo', 'listicle', 'steps', 'quote', 'circle']);
  const listicle = pin.defaultDesign(context, 'listicle');
  assert.equal(listicle.photos.length, 4, 'listicle offers one row per recipe');
  const listLayout = pin.proLayout('listicle', pin.PIN_SIZE, 4);
  assert.equal(listLayout.rows.length, 4);
  listLayout.rows.forEach((row) => {
    assert.ok(row.y >= 0 && row.y + row.height <= 1500, 'listicle row on canvas');
    assert.ok(row.thumb.width === row.thumb.height, 'the thumbnail is square');
  });
  assert.equal(pin.proLayout('listicle', pin.PIN_SIZE, 2).rows.length, 2);

  const steps = pin.defaultDesign(context, 'steps');
  assert.equal(steps.photos[0].steps.length, 4, 'instructions flow into the steps template');
  const stepsLayout = pin.proLayout('steps', pin.PIN_SIZE, 1);
  assert.equal(stepsLayout.stepRows.length, 4);
  assert.ok(stepsLayout.stepRows[3].y + stepsLayout.stepRows[3].height <= 1450);
  const quoteLayout = pin.proLayout('quote', pin.PIN_SIZE, 1);
  assert.ok(quoteLayout.card.x >= 0 && quoteLayout.card.y + quoteLayout.card.height <= 1500);
  const circleLayout = pin.proLayout('circle', pin.PIN_SIZE, 1);
  assert.ok(circleLayout.circle.cx - circleLayout.circle.r > 0 && circleLayout.circle.cx + circleLayout.circle.r < 1000);

  // layout position editor: nudges normalize and stay within bounds
  const nudged = pin.normalizeDesign({
    template: 'checklist',
    layout: { headlineAlign: 'center', headlineShiftY: -9, ctaAlign: 'end', ctaShiftX: 12, ctaShiftY: 40 },
  });
  assert.equal(nudged.layout.ctaShiftY, 15, 'vertical CTA nudge is clamped');
  assert.equal(nudged.layout.headlineAlign, 'center');
  const classicNudge = pin.normalizeDesign({ template: 'scrim' });
  assert.equal(classicNudge.layout.ctaAlign, 'start', 'classic CTAs keep their original spot by default');
  const proDefault = pin.normalizeDesign({ template: 'banner' });
  assert.equal(proDefault.layout.ctaAlign, 'center', 'pro CTAs are centered by default');
  const slot = pin.normalizeSlot({ focusY: 3, steps: ['a', '', 'b'] }, 0);
  assert.equal(slot.focusY, 1, 'slot focus is clamped');
  assert.deepEqual(slot.steps, ['a', 'b']);

  // unknown template stored on an old draft falls back instead of crashing
  assert.equal(pin.normalizeDesign({ template: 'mystery' }).template, 'scrim');
  assert.equal(pin.isRtl('وصفة عربية'), true);
  assert.equal(pin.isRtl('English headline'), false);
});

test('pin studio can be toggled off per tenant while defaulting to enabled', () => {
  const store = require('../lib/store');
  const { SettingsPersistenceContract } = require('../lib/contracts');
  store.saveSiteSettings({ pinStudioEnabled: false }, 'site-toggle');
  assert.equal(store.getSettingsSummary('site-toggle').pinStudioEnabled, false);
  // an unrelated save must not silently re-enable the studio
  store.saveSiteSettings({ wordpressBaseUrl: 'https://example.com' }, 'site-toggle');
  assert.equal(store.getSettingsSummary('site-toggle').pinStudioEnabled, false);
  store.saveSiteSettings({ pinStudioEnabled: true }, 'site-toggle');
  assert.equal(store.getSettingsSummary('site-toggle').pinStudioEnabled, true);
  assert.equal(store.getSettingsSummary('site-never-touched').pinStudioEnabled, true, 'on by default');
  const merged = SettingsPersistenceContract.merge({ pinStudioEnabled: false }, { wordpressBaseUrl: 'x' });
  assert.equal(merged.pinStudioEnabled, false);
});

test('the published recipe card is self-styled, kses-safe and bilingual', () => {
  const { DraftContract } = contracts;
  const ar = DraftContract.normalize({
    title: 'طريقة عمل كريب الدجاج',
    slug: 'chicken-crepe-recipe',
    contentType: 'recipe',
    metaDescription: 'وصفة سريعة',
    htmlContent: '<h2>المقدمة</h2><p>نص المقال</p>',
    recipe: {
      description: 'وصفة لذيذة وسريعة',
      prepTime: '15 دقيقة', cookTime: '20 دقيقة', recipeYield: '4 أشخاص', cuisine: 'عربي',
      ingredients: ['دجاج', 'جبن', 'خبز التورتيلا'],
      instructions: [
        { name: 'التقطيع', text: 'قطّعي الدجاج شرائح' },
        { name: '', text: 'اطبخيه على نار هادئة' },
        { name: '', text: 'أضيفي الجبن' },
        { name: '', text: 'لُفّي الكريب وقدّميه' },
      ],
      notes: ['يقدّم ساخنًا'],
    },
  }, 'وصفات');
  const card = ar.htmlContent.slice(ar.htmlContent.indexOf('askinz-recipe-card') - 30);
  assert.ok(ar.htmlContent.includes('data-recipe-card="true"'));
  assert.ok(!/^<section/.test(card) && !ar.htmlContent.includes('<section'), 'uses kses-safe div, not <section>');
  assert.ok(ar.htmlContent.includes('style="'), 'styles are inline so any theme renders the card');
  for (const label of ['المكوّنات', 'طريقة التحضير', 'تحضير:', 'الكمية:', 'ملاحظات مفيدة']) {
    assert.ok(ar.htmlContent.includes(label), `Arabic label present: ${label}`);
  }
  assert.ok(ar.htmlContent.includes('direction:rtl'));
  // no disallowed tag names travel inside the card
  const cardHtml = ar.htmlContent.slice(ar.htmlContent.indexOf('<div class="askinz-recipe-card"'));
  assert.doesNotMatch(cardHtml, /<(section|script|style|iframe|object|embed)\b/i);
  assert.ok(cardHtml.includes('قطّعي الدجاج شرائح'));

  const en = DraftContract.normalize({
    title: 'Chicken Crepes',
    slug: 'chicken-crepes-recipe',
    contentType: 'recipe',
    metaDescription: 'Quick dinner',
    htmlContent: '<p>Intro</p>',
    recipe: {
      prepTime: '15 min', cookTime: '20 min', recipeYield: '4 servings',
      ingredients: ['chicken', 'cheese'],
      instructions: [{ text: 'Cut the chicken.' }, { text: 'Cook it.' }, { text: 'Add cheese.' }, { text: 'Serve.' }],
    },
  }, 'Dinner');
  assert.ok(en.htmlContent.includes('Ingredients</h3>'));
  assert.ok(en.htmlContent.includes('Instructions</h3>'));
  assert.ok(en.htmlContent.includes('Prep:'));
  assert.ok(en.htmlContent.includes('Yield:'));
  assert.ok(en.htmlContent.includes('direction:ltr'));
});

test('plain permalinks are detected and canonical URLs fall back to the real post link', async (t) => {
  const wp = await mocks.startWordPressMock({ plainPermalinks: true });
  t.after(() => wp.server.close());
  store.saveSiteSettings({
    wordpressBaseUrl: wp.url, wordpressUsername: 'a', wordpressAppPassword: 'p', categoryId: '3',
  }, 'site-plain');
  const draft = contracts.DraftContract.normalize(mocks.sampleArticleJson(), 'Chicken');
  const result = await wordpress.publish({
    siteId: 'site-plain',
    draft,
    images: {
      featured: mocks.makeDataUrl(mocks.tinyPng(1200, 800)),
      pinterest: mocks.makeDataUrl(mocks.tinyPng(1000, 1500)),
    },
  });
  assert.equal(result.plainPermalinks, true);
  assert.match(result.url, /\?p=\d+/);
  assert.match(result.permalinkSettingsUrl, /options-permalink\.php$/);
  // the body must not pin SEO/Pinterest links at a 404 /slug/ address
  const stored = wp.data.posts[0];
  assert.match(stored.content.raw, /\?p=\d+/, 'canonical/share URLs were re-pointed to the real link');
  assert.ok(!stored.content.raw.includes(`/${stored.slug}/`), 'no pretty slug links remain while plain permalinks rule');

  const connection = await wordpress.testConnection({ siteId: 'site-plain' });
  assert.equal(connection.plainPermalinks, true, 'the connection check warns before the next publish');

  // a normal site keeps pretty links and no flag
  const wp2 = await mocks.startWordPressMock();
  t.after(() => wp2.server.close());
  store.saveSiteSettings({ wordpressBaseUrl: wp2.url, wordpressUsername: 'a', wordpressAppPassword: 'p', categoryId: '3' }, 'site-pretty');
  const pretty = await wordpress.publish({
    siteId: 'site-pretty',
    draft: contracts.DraftContract.normalize(mocks.sampleArticleJson(), 'Chicken'),
    images: {
      featured: mocks.makeDataUrl(mocks.tinyPng(1200, 800)),
      pinterest: mocks.makeDataUrl(mocks.tinyPng(1000, 1500)),
    },
  });
  assert.equal(pretty.plainPermalinks, false);
  assert.ok(pretty.url.includes('crispy-air-fryer-chicken-wings'));
});

test('the composed pin is stored as a 2:3 image and published instead of the raw upload', async (t) => {
  const mock = await mocks.startPinterestPublishMock();
  t.after(() => mock.server.close());
  const savedHosts = process.env.ORBITPRESS_PINTEREST_HOSTS;
  process.env.ORBITPRESS_PINTEREST_HOSTS = mock.url;
  t.after(() => {
    if (savedHosts == null) delete process.env.ORBITPRESS_PINTEREST_HOSTS;
    else process.env.ORBITPRESS_PINTEREST_HOSTS = savedHosts;
  });
  const sessions = require('../lib/scraper/sessions');
  const originalCookie = sessions.cookieHeader;
  sessions.cookieHeader = async () => 'csrftoken=abc123; _pinterest_sess=fake; _auth=1';
  t.after(() => { sessions.cookieHeader = originalCookie; });

  // the pin canvas always exports 1000 × 1500, and the server holds it to that
  const composed = imagesLib.storeImage({ kind: 'pin', dataUrl: mocks.makeDataUrl(mocks.tinyPng(1000, 1500)), siteId: 'site-pin' });
  assert.ok(composed.reference.startsWith('local://'));
  assert.throws(() => imagesLib.storeImage({ kind: 'pin', dataUrl: mocks.makeDataUrl(mocks.tinyPng(1024, 1024)), siteId: 'site-pin' }), /2:3/);

  const raw = imagesLib.storeImage({ kind: 'pinterest', dataUrl: mocks.makeDataUrl(mocks.tinyPng(1000, 1500)), siteId: 'site-pin' });
  store.saveSiteSettings({ pinterestBoardId: 'https://www.pinterest.com/mockuser/recipes/' }, 'site-pin');
  const draft = {
    title: 'Sourdough Bread',
    metaDescription: 'A simple loaf with four ingredients.',
    images: { pinterest: raw.reference, pin: composed.reference },
    pinTitle: 'Easy Sourdough Bread',
    pinDescription: 'A simple loaf with four ingredients. · 20 min prep — Full recipe on askinz.com',
    pinAltText: 'Easy Sourdough Bread',
  };
  const result = await wordpress.publishPinterest({ siteId: 'site-pin', draft, link: 'https://askinz.test/sourdough-bread/' });
  assert.equal(result.ok, true, result.message);
  const created = mock.bodies.find((body) => body.options && body.options.title);
  assert.ok(created, 'PinResource/create carried the pin options');
  assert.equal(created.options.title, 'Easy Sourdough Bread');
  assert.equal(created.options.alt_text, 'Easy Sourdough Bread');
  assert.equal(created.options.link, 'https://askinz.test/sourdough-bread/');
  assert.ok(created.options.description.includes('Full recipe on askinz.com'));
});

test('publishing without a board names the missing setting instead of guessing', async () => {
  store.saveSiteSettings({ pinterestBoardId: '' }, 'site-noboard');
  const image = imagesLib.storeImage({ kind: 'pinterest', dataUrl: mocks.makeDataUrl(mocks.tinyPng(1000, 1500)), siteId: 'site-noboard' });
  await assert.rejects(
    () => wordpress.publishPinterest({ siteId: 'site-noboard', draft: { title: 'x', images: { pinterest: image.reference } }, link: 'https://askinz.test/x/' }),
    /لوحة/,
  );
});

// ---------------------------------------------------------------------------

test('image API probe works from the image settings alone', async (t) => {
  const api = await mocks.startImageApiMock();
  t.after(() => api.server.close());
  store.saveSiteSettings({ imageProvider: 'openai-compatible', imageBaseUrl: api.url + '/v1', imageModel: 'test-image', imageApiToken: 'k' }, 'site-img');
  const result = await wordpress.testImageApi({ siteId: 'site-img' });
  assert.equal(result.ok, true, result.message);
  assert.equal(result.provider, 'openai-compatible');
  assert.ok(result.bytes > 0);
  assert.equal(result.mimeType, 'image/png');

  // image generation must not be gated behind WordPress
  store.saveSiteSettings({ imageProvider: 'cloudflare', imageAccountId: '', imageApiToken: '' }, 'site-img-empty');
  await assert.rejects(() => wordpress.testImageApi({ siteId: 'site-img-empty' }), /image settings/);
});

test('generating a Pinterest image asks for a portrait and hands back raw bytes to fit', async (t) => {
  const api = await mocks.startImageApiMock();
  t.after(() => api.server.close());
  store.saveSiteSettings({ imageProvider: 'openai-compatible', imageBaseUrl: api.url + '/v1', imageModel: 'test-image', imageApiToken: 'k' }, 'site-gen');

  // store:false is how the UI gets the provider's own shape so it can fit the
  // image to 2:3 in the browser — the server must not reject a square result.
  const raw = await wordpress.generateImage({ siteId: 'site-gen', kind: 'pinterest', prompt: 'sourdough bread', store: false });
  assert.equal(api.calls[0].size, '1024x1536', 'a pin slot asks for a portrait');
  assert.ok(raw.dataUrl.startsWith('data:image/png;base64,'));
  assert.equal(raw.height, 64, 'the provider shape is reported so the UI knows it must fit');
  assert.equal('reference' in raw, false, 'nothing is stored until the fitted image comes back');

  // storing the same square image directly is still refused: the shape matters
  await assert.rejects(() => wordpress.generateImage({ siteId: 'site-gen', kind: 'pinterest', prompt: 'sourdough bread' }), /2:3/);

  const featured = await wordpress.generateImage({ siteId: 'site-gen', kind: 'featured', prompt: 'sourdough bread', store: false });
  assert.ok(featured.dataUrl.startsWith('data:image/png;base64,'));
  assert.equal(api.calls[api.calls.length - 1].size, '1536x1024', 'a featured slot asks for a landscape');
});

test('a provider that only accepts square images is retried instead of failing', async (t) => {
  const api = await mocks.startImageApiMock({ rejectSize: '1024x1024' });
  t.after(() => api.server.close());
  store.saveSiteSettings({ imageProvider: 'openai-compatible', imageBaseUrl: api.url + '/v1', imageModel: 'dall-e-3', imageApiToken: 'k' }, 'site-strict');
  const raw = await wordpress.generateImage({ siteId: 'site-strict', kind: 'pinterest', prompt: 'sourdough bread', store: false });
  assert.deepEqual(api.calls.map((call) => call.size), ['1024x1536', '1024x1024']);
  assert.ok(raw.dataUrl.startsWith('data:image/png;base64,'));
  assert.equal(raw.width, 64);
});

test('an explicit per-image prompt overrides the saved article image prompt', async (t) => {
  const api = await mocks.startImageApiMock();
  t.after(() => api.server.close());
  store.saveSiteSettings(
    { imageProvider: 'openai-compatible', imageBaseUrl: api.url + '/v1', imageModel: 'test-image', imageApiToken: 'k', imagePrompt: 'SAVED BASE PROMPT {{title}}' },
    'site-role',
  );
  // Each additional in-article image sends its own shot-role prompt; it must
  // win over the shared saved prompt so images never come back identical.
  await wordpress.generateImage({ siteId: 'site-role', kind: 'article', prompt: 'UNIQUE INGREDIENTS FLAT LAY SHOT', title: 'Bread', store: false });
  assert.equal(api.calls.at(-1).prompt, 'UNIQUE INGREDIENTS FLAT LAY SHOT');
  // With no explicit prompt the saved setting is the fallback (variables expanded).
  await wordpress.generateImage({ siteId: 'site-role', kind: 'article', title: 'Bread', store: false });
  assert.equal(api.calls.at(-1).prompt, 'SAVED BASE PROMPT Bread');
});

test('pinterest images fall back to the first saved template and accept a chosen one', async (t) => {
  const api = await mocks.startImageApiMock();
  t.after(() => api.server.close());
  store.saveSiteSettings(
    {
      imageProvider: 'openai-compatible', imageBaseUrl: api.url + '/v1', imageModel: 'test-image', imageApiToken: 'k',
      pinterestPrompts: [{ name: 'moody', prompt: 'MOODY TEMPLATE {{title}}' }, { name: 'macro', prompt: 'MACRO TEMPLATE' }],
    },
    'site-tpl',
  );
  await wordpress.generateImage({ siteId: 'site-tpl', kind: 'pinterest', title: 'Soup', store: false });
  assert.equal(api.calls.at(-1).prompt, 'MOODY TEMPLATE Soup', 'no explicit prompt uses the first saved template');
  await wordpress.generateImage({ siteId: 'site-tpl', kind: 'pinterest', prompt: 'CHOSEN TEMPLATE', title: 'Soup', store: false });
  assert.equal(api.calls.at(-1).prompt, 'CHOSEN TEMPLATE', 'the template picked in the studio wins');
});

test('settings merge keeps and sanitizes pinterest prompt templates', () => {
  const merged = contracts.SettingsPersistenceContract.merge({}, {
    pinterestPrompts: [
      { name: ' Moody ', prompt: ' prompt A ' },
      { name: 'empty', prompt: '   ' },
      { prompt: 'prompt C' },
    ],
  });
  assert.deepEqual(merged.pinterestPrompts, [
    { name: 'Moody', prompt: 'prompt A' },
    { name: '', prompt: 'prompt C' },
  ]);
  // a non-array payload never wipes the stored library
  const kept = contracts.SettingsPersistenceContract.merge({ pinterestPrompts: [{ name: 'x', prompt: 'y' }] }, { pinterestPrompts: null });
  assert.deepEqual(kept.pinterestPrompts, [{ name: 'x', prompt: 'y' }]);
});

test('custom analyzer prompt reaches the model and keeps the {platform} token', async (t) => {
  const api = await mocks.startArticleApiMock();
  t.after(() => api.server.close());
  store.saveSiteSettings(
    { articleBaseUrl: api.url + '/v1', articleModel: 'gen-x', articleApiKey: 'k', analyzerPrompt: 'CUSTOM {platform} analyst house style, return the required JSON.' },
    'site-custom-analyzer',
  );
  const result = await article.analyzePinterestKeywords({
    siteId: 'site-custom-analyzer',
    posts: [{ title: 'Cozy throw', text: 'chunky crochet blanket pattern', url: 'https://pin.test/1', viralScore: 9 }],
  });
  assert.equal(result.ok, true);
  const sent = api.calls.at(-1);
  assert.equal(sent.messages[0].content, 'CUSTOM pinterest analyst house style, return the required JSON.');
});

test('custom article system persona replaces the built-in editor persona', async (t) => {
  const api = await mocks.startArticleApiMock();
  t.after(() => api.server.close());
  store.saveSiteSettings(
    { articleBaseUrl: api.url + '/v1', articleModel: 'gen-x', articleApiKey: 'k', wordpressBaseUrl: 'https://wp.example.com', wordpressUsername: 'a', wordpressAppPassword: 'p', articleSystemPrompt: 'You are the cheerful brand voice of Baking Club.' },
    'site-custom-persona',
  );
  await article.generate({ keyword: 'crispy chicken wings', niche: 'food', contentType: 'auto', siteId: 'site-custom-persona' });
  const sent = api.calls.at(-1);
  assert.equal(sent.messages[0].content, 'You are the cheerful brand voice of Baking Club.');
  assert.equal(sent.messages[0].content.includes('Askinz'), false);
});

test('prompt defaults are exported and token-expanded', () => {
  assert.match(article.PROMPT_DEFAULTS.analyzer, /\{platform\}/);
  assert.match(article.PROMPT_DEFAULTS.recipeRepairInstruction, /\{count\}/);
  assert.ok(article.PROMPT_DEFAULTS.feedspyAr.includes('JSON'));
});

test('settings merge keeps the customizable prompt overrides and role shots', () => {
  // legacy plain-array shot libraries migrate to the generic '*' niche
  const merged = contracts.SettingsPersistenceContract.merge({}, {
    analyzerPrompt: '  custom analyst  ',
    articleImageRolePrompts: [{ name: 'shot 1', prompt: 'hero' }, { name: '', prompt: '   ' }],
  });
  assert.equal(merged.analyzerPrompt, 'custom analyst');
  assert.deepEqual(merged.articleImageRolePrompts, { '*': [{ name: 'shot 1', prompt: 'hero' }] });
  // per-niche object form is sanitized; unknown niches are dropped
  const byNiche = contracts.SettingsPersistenceContract.merge({}, {
    articleImageRolePrompts: {
      food: [{ name: 'f1', prompt: 'dish hero' }, { name: 'blank', prompt: '' }],
      crochet: [{ name: 'c1', prompt: 'yarn flat lay' }],
      unknownNiche: [{ name: 'x', prompt: 'y' }],
    },
  });
  assert.deepEqual(byNiche.articleImageRolePrompts, {
    food: [{ name: 'f1', prompt: 'dish hero' }],
    crochet: [{ name: 'c1', prompt: 'yarn flat lay' }],
  });
  // a null payload never wipes a stored library
  const kept = contracts.SettingsPersistenceContract.merge(
    { analyzerPrompt: 'x', articleImageRolePrompts: { food: [{ name: 'a', prompt: 'b' }] } },
    { articleImageRolePrompts: null, analyzerPrompt: '' },
  );
  assert.equal(kept.analyzerPrompt, '');
  assert.deepEqual(kept.articleImageRolePrompts, { food: [{ name: 'a', prompt: 'b' }] });
});

test('additional images are placed beside their recipe sections, not appended at the end', () => {
  const { WordPressMarkup } = contracts;
  const html = '<p>Intro paragraph explaining the bake.</p>'
    + '<h2>Why this recipe works</h2><p>Science notes.</p>'
    + '<h2>Pro tips</h2><p>Handy advice.</p>'
    + '<section class="askinz-recipe-card" data-recipe-card="true"><h2>Easy Bread</h2><p>Description.</p>'
    + '<h3>Ingredients</h3><ul><li>500g flour</li></ul>'
    + '<h3>Instructions</h3><ol><li>Mix the dough.</li></ol></section>';
  const figures = WordPressMarkup.inlineRoleOrder().slice(0, 6).map((role) => ({ role, html: `<figure data-role="${role}"></figure>` }));
  const out = WordPressMarkup.placeInlineImages(html, figures);
  const pos = (s) => out.indexOf(s);
  // hero follows the introduction, before the first section
  assert.ok(pos('data-role="hero"') < pos('<h2>Why this recipe works</h2>'), 'hero sits after the intro');
  // ingredients shot directly under the recipe card's Ingredients heading
  assert.ok(pos('<h3>Ingredients</h3>') < pos('data-role="ingredients"'));
  assert.ok(pos('data-role="ingredients"') < pos('<ul><li>500g flour</li></ul>'), 'ingredients shot precedes the list');
  // preparation/cooking shot anchors to the Instructions heading
  assert.ok(pos('<h3>Instructions</h3>') < pos('data-role="preparation"') || pos('<h3>Instructions</h3>') < pos('data-role="cooking"'));
  // detail shot finds the tips section
  assert.ok(pos('<h2>Pro tips</h2>') < pos('data-role="detail"'));
  // nothing is dumped wholesale after the recipe card
  const cardEnd = pos('</section>');
  assert.ok(['hero', 'ingredients', 'preparation', 'cooking', 'detail'].every((role) => pos(`data-role="${role}"`) < cardEnd));
  assert.equal((out.match(/data-role=/g) || []).length, 6, 'every image is placed exactly once');
});

test('additional images anchor to niche article headings and spread the rest', () => {
  const { WordPressMarkup } = contracts;
  const html = '<p>Intro.</p>'
    + '<h2>Materials and tools you need</h2><p>Yarn and hooks.</p>'
    + '<h2>Step by step preparation</h2><p>Get ready.</p>'
    + '<h2>How to crochet the square</h2><p>Keep stitching.</p>'
    + '<h2>Storage and care</h2><p>Look after it.</p>';
  const figures = WordPressMarkup.inlineRoleOrder().slice(0, 6).map((role) => ({ role, html: `<figure data-role="${role}"></figure>` }));
  const out = WordPressMarkup.placeInlineImages(html, figures);
  const pos = (s) => out.indexOf(s);
  assert.ok(pos('<h2>Materials and tools') < pos('data-role="ingredients"'));
  assert.ok(pos('<h2>Step by step preparation') < pos('data-role="preparation"'));
  assert.ok(pos('<h2>How to crochet') < pos('data-role="cooking"'));
  assert.ok(pos('<h2>Storage and care') < pos('data-role="lifestyle"'));
  // ordered: hero must still be the first figure in the document
  assert.ok(pos('data-role="hero"') < pos('data-role="ingredients"'));
  assert.match(WordPressMarkup.inlineRoleAltTitle('Cozy Throw', 'ingredients'), /materials laid out/);
});

test('articles without headings still receive every additional image', () => {
  const { WordPressMarkup } = contracts;
  const html = '<p>Just one paragraph, no headings at all.</p>';
  const figures = WordPressMarkup.inlineRoleOrder().slice(0, 3).map((role) => ({ role, html: `<figure data-role="${role}"></figure>` }));
  const out = WordPressMarkup.placeInlineImages(html, figures);
  assert.equal((out.match(/data-role=/g) || []).length, 3);
});

test('pin fitting crops to cover and letterboxes to contain', () => {
  const pin = require('../public/app/pinStudio.js');
  const cover = pin.fitRect(1200, 800, 1000, 1500, 'cover');
  assert.equal(cover.height, 1500);
  assert.ok(cover.width >= 1000);
  assert.equal(cover.x, (1000 - cover.width) / 2);
  const contain = pin.fitRect(1200, 800, 1000, 1500, 'contain');
  assert.equal(contain.width, 1000);
  assert.ok(contain.height <= 1500);
  assert.equal(contain.y, (1500 - contain.height) / 2);
  assert.deepEqual(pin.fitRect(0, 0, 1000, 1500, 'cover'), { x: 0, y: 0, width: 1000, height: 1500 });
});

test('the article preview is the exact markup publish sends, using local images', async () => {
  const featured = imagesLib.storeImage({ kind: 'featured', dataUrl: mocks.makeDataUrl(mocks.tinyPng(1200, 800)), siteId: 'site-prev' });
  const pinterest = imagesLib.storeImage({ kind: 'pinterest', dataUrl: mocks.makeDataUrl(mocks.tinyPng(1000, 1500)), siteId: 'site-prev' });
  const inline = imagesLib.storeImage({ kind: 'article', dataUrl: mocks.makeDataUrl(mocks.tinyPng(800, 600)), siteId: 'site-prev' });
  const draft = contracts.DraftContract.normalize(mocks.sampleArticleJson(), 'Chicken');
  const images = { featured: featured.reference, pinterest: pinterest.reference, additional: [inline.reference] };
  const localUrl = (reference) => `/api/images/${String(reference).slice('local://'.length)}?siteId=site-prev`;

  // without WordPress the preview still builds and admits its links are placeholders
  store.saveSiteSettings({ wordpressBaseUrl: '' }, 'site-prev');
  const preview = await wordpress.previewArticle({ siteId: 'site-prev', draft, images });
  assert.equal(preview.placeholderLinks, true);
  assert.ok(preview.html.includes(localUrl(featured.reference)), 'the preview shows the real stored file');
  assert.ok(preview.html.includes(localUrl(inline.reference)), 'inline images are placed as they will be published');
  assert.ok(preview.html.includes('Save on Pinterest'));
  assert.ok(preview.html.includes(String(draft.htmlContent).slice(0, 40)));

  // with WordPress configured, byte-identical to publish's own markup
  store.saveSiteSettings({ wordpressBaseUrl: 'https://wp.example.com' }, 'site-prev');
  const configured = await wordpress.previewArticle({ siteId: 'site-prev', draft, images });
  assert.equal(configured.placeholderLinks, false);
  assert.equal(configured.html, wordpress.assemblePublishedHtml({
    draft,
    root: 'https://wp.example.com',
    slug: draft.slug,
    featuredUrl: localUrl(featured.reference),
    pinterestUrl: localUrl(pinterest.reference),
    additionalUrls: [localUrl(inline.reference)],
  }));
});

test('publishing uploads the markup the article preview showed', async (t) => {
  const wp = await mocks.startWordPressMock();
  t.after(() => wp.server.close());
  store.saveSiteSettings({
    wordpressBaseUrl: wp.url, wordpressUsername: 'admin', wordpressAppPassword: 'pw', categoryId: '3',
  }, 'site-preview-publish');
  const featured = imagesLib.storeImage({ kind: 'featured', dataUrl: mocks.makeDataUrl(mocks.tinyPng(1200, 800)), siteId: 'site-preview-publish' });
  const pinterest = imagesLib.storeImage({ kind: 'pinterest', dataUrl: mocks.makeDataUrl(mocks.tinyPng(1000, 1500)), siteId: 'site-preview-publish' });
  const inline = imagesLib.storeImage({ kind: 'article', dataUrl: mocks.makeDataUrl(mocks.tinyPng(800, 600)), siteId: 'site-preview-publish' });
  const draft = contracts.DraftContract.normalize(mocks.sampleArticleJson(), 'Chicken');
  await wordpress.publish({
    siteId: 'site-preview-publish',
    draft,
    images: { featured: featured.reference, pinterest: pinterest.reference, additional: [inline.reference] },
    categoryId: '3',
    postStatus: 'publish',
  });
  const post = wp.data.posts[wp.data.posts.length - 1];
  const [featuredMedia, pinterestMedia, inlineMedia] = wp.data.media;
  assert.equal(post.content.raw, wordpress.assemblePublishedHtml({
    draft,
    root: wp.url,
    slug: draft.slug,
    featuredUrl: featuredMedia.source_url,
    pinterestUrl: pinterestMedia.source_url,
    additionalUrls: [inlineMedia.source_url],
  }));
});

test('a probe that reports failure still reaches the UI with its full report', async (t) => {
  const started = await startServer();
  t.after(() => new Promise((resolve) => { started.close(resolve); }));
  const wp = await mocks.startWordPressMock();
  t.after(() => wp.server.close());
  wp.data.expectedAuth = 'Basic ' + Buffer.from('admin:app-pass', 'utf8').toString('base64');

  // an image provider that cannot be reached: the probe must say so, not vanish
  store.saveSiteSettings({ imageProvider: 'openai-compatible', imageBaseUrl: 'https://127.0.0.1:1/v1', imageApiToken: 'k' }, 'site-verdict');
  let res = await fetch(`${started.url}/api/bridge/call`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'v1', type: 'testImageApi', siteId: 'site-verdict' }),
  });
  const probe = await res.json();
  assert.equal(probe.ok, true, 'the call itself completed, so the transport must not fail');
  assert.equal(probe.verdict, false, "the probe's own verdict travels as its own field");
  assert.ok(probe.message, 'and the reason travels with it');

  // the WordPress diagnostic: a refused connection is a finding, not an error
  store.saveSiteSettings({ wordpressBaseUrl: wp.url, wordpressUsername: 'admin', wordpressAppPassword: 'wrong' }, 'site-verdict-wp');
  res = await fetch(`${started.url}/api/bridge/call`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'v2', type: 'diagnoseWordPress', siteId: 'site-verdict-wp' }),
  });
  const diagnosis = await res.json();
  assert.equal(diagnosis.ok, true, 'a refused connection is a report the UI must receive');
  assert.equal(diagnosis.verdict, false);
  assert.ok(diagnosis.steps.length >= 3, 'every probe is delivered');
  assert.ok(diagnosis.advice.length >= 1, 'with the advice the user needs');
});

test('stored images are served to the browser, and only stored images', async (t) => {
  const stored = imagesLib.storeImage({ kind: 'featured', dataUrl: mocks.makeDataUrl(mocks.tinyPng(1200, 800)), siteId: 'site-serve' });
  const file = stored.reference.slice('local://'.length);
  const started = await startServer();
  t.after(() => new Promise((resolve) => { started.close(resolve); }));

  const res = await fetch(`${started.url}/api/images/${file}?siteId=site-serve`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/png');
  const served = Buffer.from(await res.arrayBuffer());
  assert.equal(served.length, mocks.tinyPng(1200, 800).length, 'the stored bytes come back unchanged');

  // another site's image, a traversal attempt and a made-up name are all refused
  assert.equal((await fetch(`${started.url}/api/images/${file}?siteId=site-other`)).status, 404);
  assert.equal((await fetch(`${started.url}/api/images/..%2F..%2Fsettings.json?siteId=site-serve`)).status, 404);
  assert.equal((await fetch(`${started.url}/api/images/not-a-file.txt?siteId=site-serve`)).status, 404);
});

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------

test('Article API probe reports a working provider and a failing one', async (t) => {
  const api = await mocks.startArticleApiMock();
  t.after(() => api.server.close());
  store.saveSiteSettings({ articleBaseUrl: api.url + '/v1', articleModel: 'gen-x', articleApiKey: 'k' }, 'site-probe');
  const good = await article.testArticleApi({ siteId: 'site-probe' });
  assert.equal(good.ok, true);
  assert.equal(good.model, 'gen-x');
  assert.ok(good.latencyMs >= 0);

  // unreachable provider -> ok:false with a message, never a crash
  store.saveSiteSettings({ articleBaseUrl: 'https://127.0.0.1:9/v1', articleModel: 'gen-x', articleApiKey: 'k' }, 'site-probe-down');
  const bad = await article.testArticleApi({ siteId: 'site-probe-down' });
  assert.equal(bad.ok, false);
  assert.ok(bad.message && bad.message.length > 5);

  // no settings at all -> asks for the AI fields by name
  store.saveSiteSettings({}, 'site-probe-empty');
  await assert.rejects(() => article.testArticleApi({ siteId: 'site-probe-empty' }), /إعدادات مزوّد المقالات/);
});

// ---------------------------------------------------------------------------

test('AI settings and WordPress settings gate independently', async (t) => {
  const api = await mocks.startArticleApiMock();
  t.after(() => api.server.close());
  // only the Article API is configured
  store.saveSiteSettings({ articleBaseUrl: api.url + '/v1', articleModel: 'gen-x', articleApiKey: 'k' }, 'site-ai-only');

  const result = await article.viralKeywords({
    siteId: 'site-ai-only',
    posts: [{ id: '111111111111111111', title: 'Sourdough: 7 Steps', text: 'starter discard ideas' }],
  });
  assert.equal(result.ok, true, 'AI work must run without WordPress configured');
  assert.ok(result.items.length >= 1);

  await assert.rejects(
    () => wordpress.categories({ siteId: 'site-ai-only' }),
    /WordPress settings/,
    'WordPress work must still require WordPress settings',
  );
});

// ---------------------------------------------------------------------------

test('viral handoff asks the AI analyzer for one keyword per pin', async (t) => {
  const api = await mocks.startArticleApiMock();
  t.after(() => api.server.close());
  store.saveSiteSettings({ articleBaseUrl: api.url + '/v1', articleModel: 'gen-x', articleApiKey: 'k', wordpressBaseUrl: 'https://wp.example.com', wordpressUsername: 'a', wordpressAppPassword: 'p' }, 'site-viral');
  const result = await article.viralKeywords({
    siteId: 'site-viral',
    language: 'en',
    posts: [
      { id: '111111111111111111', title: 'Sourdough: 7 Steps', text: 'starter discard ideas', saves: 1200, viralScore: 100 },
      { id: '222222222222222222', title: 'No Knead Bread', text: 'easy loaf', saves: 400, viralScore: 40 },
    ],
  });
  assert.equal(result.ok, true);
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].keyword, 'sourdough starter discard recipes');
  assert.equal(result.items[0].contentType, 'recipe');
  assert.ok(result.items[1].angle.length > 3);
  // the posts are what the model receives — no invented context
  const sent = api.calls[api.calls.length - 1];
  assert.equal(sent.messages[1].content.includes('starter discard ideas'), true);
});

// ---------------------------------------------------------------------------

test('pinterest resource layer reads the JSON the Pinterest front-end uses', async (t) => {
  const mock = await mocks.startPinterestResourceMock();
  t.after(() => mock.server.close());
  const savedHosts = process.env.ORBITPRESS_PINTEREST_HOSTS;
  process.env.ORBITPRESS_PINTEREST_HOSTS = mock.url;
  t.after(() => {
    if (savedHosts == null) delete process.env.ORBITPRESS_PINTEREST_HOSTS;
    else process.env.ORBITPRESS_PINTEREST_HOSTS = savedHosts;
  });
  const resource = require('../lib/scraper/pinterestResource');

  // direct calls
  const boardPins = await resource.boardPins('mockuser', 'recipes', { maxItems: 5 });
  assert.equal(boardPins.length, 2);
  assert.equal(boardPins[0].title, 'Board Pin One');
  assert.equal(boardPins[0].saves, 418); // engagement actually survives here
  assert.equal(boardPins[0].comments, 3);
  assert.equal(boardPins[0].publishedAt, '2025-01-07T18:23:09.000Z');
  assert.equal(boardPins[0].boardName, 'Recipes');
  assert.equal(boardPins[0].author, 'Mock User');

  const boards = await resource.profileBoards('mockuser', {});
  assert.equal(boards.length, 1);
  assert.equal(boards[0].name, 'Recipes');

  const searched = await resource.searchPins('pot roast', { maxItems: 5 });
  assert.equal(searched.length, 1);
  assert.equal(searched[0].title, 'Search Result One');

  const detail = await resource.pinDetail('444444444444444444', {});
  assert.equal(detail.title, 'Detailed Pin');

  // and through the scanner itself, merged ahead of the HTML islands
  const result = await scanPinterest({ url: 'https://www.pinterest.com/mockuser/recipes/', maxItems: 5 });
  assert.equal(result.ok, true);
  assert.ok(String(result.collectionMethod).includes('resource_api'), `expected resource_api, got ${result.collectionMethod}`);
  assert.equal(result.pipeline.resource, 2);
  const merged = result.posts.find((post) => post.id === '111111111111111111');
  assert.equal(merged.title, 'Board Pin One');
  assert.equal(merged.saves, 418);
});

// ---------------------------------------------------------------------------

test('viral score stays honest when a batch carries no engagement signal', () => {
  const quiet = analyzer.rankPosts([
    { id: '1', saves: 1 }, { id: '2', saves: 1 }, { id: '3', reactions: 2 },
  ]);
  quiet.forEach((post) => assert.equal(post.viralScore, 0, 'a quiet batch must not advertise 100'));

  const loud = analyzer.rankPosts([
    { id: '1', saves: 1 }, { id: '2', saves: 200, comments: 10 },
  ]);
  assert.equal(loud.find((post) => post.id === '2').viralScore, 100);
  assert.ok(loud.find((post) => post.id === '1').viralScore < 5);
});

// ---------------------------------------------------------------------------

test('pinterest HTTP scanner mines the embedded JSON island', async (t) => {
  const pin = await mocks.startPinterestMock();
  t.after(() => pin.server.close());
  const result = await scanPinterest({ url: pin.url + '/swaliha/', maxItems: 20, baseUrl: pin.url });
  assert.equal(result.ok, true);
  assert.equal(result.platform, 'pinterest');
  assert.ok(result.posts.length >= 3, `expected the 3 mocked pins, got ${result.posts.length}`);
  const nail = result.posts.find((p) => p.id === '100000000000000002');
  assert.equal(nail.saves, 1200);
  assert.equal(nail.comments, 44);
  assert.equal(nail.viralScore, 100);
  assert.ok(nail.url.includes('/pin/100000000000000002/'));
  assert.ok(result.stats.count >= 3);
});

// ---------------------------------------------------------------------------

test('analyzer: FeedSpy filters, sorting, stats and CSV', () => {
  const isoDaysAgo = (days) => new Date(Date.now() - days * 864e5).toISOString();
  const posts = [
    { title: 'Old viral', publishedAt: isoDaysAgo(42), reactions: 10, comments: 2, shares: 1 },
    { title: 'Fresh hit nail art', publishedAt: isoDaysAgo(2), reactions: 50, comments: 20, shares: 10 },
    { title: 'Undated mystery', publishedAt: null, reactions: 999, comments: 1, shares: 1 },
  ];
  const ranked = analyzer.rankPosts(posts);
  assert.equal(ranked.find((p) => p.title === 'Undated mystery').viralScore, 100);

  const period = analyzer.filterPeriod(ranked, { days: 7 });
  assert.equal(period.length, 1, 'undated posts drop out of period filters like FeedSpy');
  assert.equal(period[0].title, 'Fresh hit nail art');

  const searched = analyzer.filterQuery(ranked, 'nail');
  assert.deepEqual(searched.map((p) => p.title), ['Fresh hit nail art']);

  const minmax = analyzer.filterMinMax(ranked, { metric: 'reactions', min: 10, max: 60 });
  assert.equal(minmax.length, 2);

  const sorted = analyzer.sortPosts(ranked, 'comments');
  assert.equal(sorted[0].title, 'Fresh hit nail art');

  const stats = analyzer.computeStats(ranked);
  assert.equal(stats.count, 3);
  assert.ok(stats.byWeekday.some((d) => d.count > 0));

  const csv = analyzer.toCsv(ranked);
  assert.ok(csv.startsWith('title,publishedAt'));
  assert.ok(csv.split('\r\n').length === 4);
});

// ---------------------------------------------------------------------------

test('bridge operations dispatch end-to-end over HTTP', async (t) => {
  const started = await startServer();
  t.after(() => new Promise((r) => { started.close(r); }));
  const base = started.url;

  const api = await mocks.startArticleApiMock();
  t.after(() => api.server.close());
  const wp = await mocks.startWordPressMock();
  t.after(() => wp.server.close());

  let res = await fetch(base + '/api/bootstrap');
  const boot = await res.json();
  assert.ok(boot.workspace && boot.settings && boot.sessions);
  assert.equal(boot.sessions.facebook.connected, false);

  res = await fetch(base + '/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ siteId: 'site-e2e', settings: { wordpressBaseUrl: wp.url, wordpressUsername: 'a', wordpressAppPassword: 'p', articleBaseUrl: api.url + '/v1', articleModel: 'gen-x', articleApiKey: 'k', categoryId: '7' } }),
  });
  assert.equal((await res.json()).ok, true);

  res = await fetch(base + '/api/bridge/call', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'r1', type: 'testConnection', siteId: 'site-e2e' }),
  });
  const connection = await res.json();
  assert.equal(connection.ok, true);
  assert.equal(connection.accountName, 'Askinz Admin');

  res = await fetch(base + '/api/bridge/call', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'r2', type: 'generate', keyword: 'air fryer wings', niche: 'food', siteId: 'site-e2e' }),
  });
  const generated = await res.json();
  assert.equal(generated.ok, true);
  assert.equal(generated.draft.contentType, 'recipe');

  const pinMock = await mocks.startPinterestMock();
  t.after(() => pinMock.server.close());
  res = await fetch(base + '/api/scraper/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ platform: 'pinterest', url: pinMock.url + '/swaliha/', maxPins: 10, baseUrl: pinMock.url }),
  });
  const jobStart = await res.json();
  assert.equal(jobStart.ok, true);
  const job = await waitForJob(base, jobStart.jobId);
  assert.equal(job.status, 'done');
  assert.ok(job.result.posts.length >= 3);

  // FeedSpy re-query against the cached job
  res = await fetch(`${base}/api/scraper/jobs/${jobStart.jobId}/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sort: 'saves', period: { days: 90 } }),
  });
  const queried = await res.json();
  assert.equal(queried.ok, true);
  assert.equal(queried.posts[0].id, '100000000000000002');

  res = await fetch(`${base}/api/scraper/jobs/${jobStart.jobId}/export.csv`);
  assert.ok((await res.text()).includes('Nail Art Summer'));

  // settings lock verify over HTTP
  res = await fetch(base + '/api/lock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: '4242' }) });
  assert.equal((await res.json()).enabled, true);
  res = await fetch(base + '/api/lock/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: '4242' }) });
  assert.equal((await res.json()).ok, true);

  // index renders with the boot payload + bridge + feedspy assets wired
  const html = await (await fetch(base + '/')).text();
  assert.ok(html.includes('window.__BOOT__'));
  assert.ok(html.includes('/app/bridge.js'));
  assert.ok(html.includes('/app/feedspy.js'));
});

async function waitForJob(base, jobId, attempts = 40) {
  for (let i = 0; i < attempts; i += 1) {
    const job = await (await fetch(`${base}/api/scraper/jobs/${jobId}`)).json();
    if (job.status === 'done' || job.status === 'error') return job;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('job did not finish in time');
}

async function startServer() {
  const modulePath = '../index.js';
  delete require.cache[require.resolve(modulePath)];
  const express = require('express');
  const routes = require('../lib/routes');
  const app = express();
  app.use(express.json({ limit: '30mb' }));
  app.use('/api', routes);
  app.get('/', (req, res) => {
    const fs = require('fs');
    const raw = fs.readFileSync(require('path').join(__dirname, '..', 'public', 'index.html'), 'utf8');
    res.send(raw.replace('<body>', `<body><script>window.__BOOT__=${JSON.stringify({ workspace: store.loadWorkspace(), sessions: { facebook: { connected: false }, pinterest: { connected: false } } })};</script><script src="/app/bridge.js"></script>`));
  });
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve({ close: (cb) => server.close(cb), url: `http://127.0.0.1:${server.address().port}` }));
  });
}
