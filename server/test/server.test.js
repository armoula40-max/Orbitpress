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
  assert.ok(api.calls.length >= 2, 'must retry without response_format');
  assert.ok(!('response_format' in api.calls[1]));
});

// ---------------------------------------------------------------------------

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
  sessions.cookieHeader = async () => 'csrftoken=abc123; _pinterest_sess=fake';
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
  assert.ok(mock.calls.includes('/upload-image/'));
  assert.ok(mock.calls.includes('/resource/PinResource/create/'));
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
  sessions.cookieHeader = async () => 'csrftoken=abc123; _pinterest_sess=fake';
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
  await assert.rejects(() => article.testArticleApi({ siteId: 'site-probe-empty' }), /Article API settings/);
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
  const posts = [
    { title: 'Old viral', publishedAt: '2026-08-01T10:00:00Z', reactions: 10, comments: 2, shares: 1 },
    { title: 'Fresh hit nail art', publishedAt: '2026-09-05T10:00:00Z', reactions: 50, comments: 20, shares: 10 },
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
