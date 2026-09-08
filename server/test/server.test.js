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
