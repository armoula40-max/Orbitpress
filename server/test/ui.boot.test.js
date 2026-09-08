'use strict';
process.env.ORBITPRESS_ALLOW_HTTP = '1';
process.env.ORBITPRESS_DATA_DIR = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'orbitpress-ui-test-'));

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const PUBLIC = path.join(__dirname, '..', 'public');

/**
 * Boots the real shipped UI (index.html + bridge.js + feedspy.js) inside jsdom
 * with the same injection the Express server performs, then asserts the app
 * initializes and the FeedSpy layer wires itself in without throwing.
 */
test('the web UI boots with the server bridge and FeedSpy layer', async () => {
  const raw = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
  const boot = {
    workspace: { keywords: [], drafts: [], logs: [{ id: 'l1', siteId: 'site-default', type: 'boot', message: 'ok', createdAt: Date.now() }], categories: [], theme: 'day', activeSiteId: 'site-default', siteProfiles: [{ id: 'site-default', name: 'Askinz' }], plan: { dailyCount: 5, firstHour: 8, scheduleEnabled: false } },
    settingsLock: { enabled: false },
    settings: { 'site-default': { articleBaseUrl: '', articleModel: '', wordpressBaseUrl: '', wordpressUsername: '', categoryId: '', articleApiConfigured: false, wordpressConfigured: false, imageConfigured: false, pinterestConfigured: false, facebookConfigured: false, imageProvider: 'cloudflare', imageBaseUrl: '', imageAccountId: '', imageModel: '', pinterestBoardId: '', facebookGraphVersion: 'v23.0', textPrompt: '', imagePrompt: '', pinterestPrompt: '', articleImageCount: 0, scraperApiBaseUrl: '', scraperApiConfigured: false } },
    sessions: { facebook: { connected: false }, pinterest: { connected: false } },
    scheduler: { enabled: false, plan: null, recentRuns: [] },
  };
  const bridgeJs = fs.readFileSync(path.join(PUBLIC, 'app', 'bridge.js'), 'utf8');
  const feedspyJs = fs.readFileSync(path.join(PUBLIC, 'app', 'feedspy.js'), 'utf8');
  const injection = `<script>window.__BOOT__=${JSON.stringify(boot).replace(/</g, '\\u003c')};</script>\n<script>${bridgeJs}</script>`;
  const html = raw.replace('<body>', `<body>\n${injection}`);

  const errors = [];
  const dom = new JSDOM(html, {
    url: 'http://localhost:8080/',
    runScripts: 'dangerously',
    resources: undefined, // external feedspy.js won't load via file — inject manually below
    pretendToBeVisual: true,
    beforeParse(window) {
      // offline-safe stubs
      window.fetch = () => new Promise(() => {}); // pending forever: no network in boot test
      window.localStorage.clear();
    },
  });
  const { window } = dom;
  window.addEventListener('error', (event) => errors.push(event.error ? event.error.message : event.message));
  dom.errors && errors.push(...dom.errors.map((e) => e.message || String(e)));
  // run the deferred feedspy script manually (jsdom won't download it here)
  window.eval(feedspyJs);
  window.document.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 100));

  // the core app initialized
  assert.equal(window.document.querySelector('#screen-studio').classList.contains('active'), true, 'studio screen active');
  assert.equal(typeof window.Native === 'object', true, 'web bridge installed');
  assert.equal(typeof window.Native.openPinterestScanner === 'function', true);
  assert.equal(typeof window.Native.call === 'function', true);

  // lock read path from boot data
  assert.equal(JSON.parse(window.Native.loadSettingsLock()).enabled, false);
  const settings = JSON.parse(window.Native.loadSettings('site-default'));
  assert.equal(settings.articleApiConfigured, false);

  // workspace round-trip is debounced (no fetch needed to complete for the API)
  window.Native.saveWorkspace(JSON.stringify({ theme: 'night', keywords: [], drafts: [], logs: [], categories: [], siteProfiles: [{ id: 'site-default', name: 'Askinz' }], activeSiteId: 'site-default', plan: {} }));
  assert.equal(JSON.parse(window.Native.loadWorkspace()).theme, 'night');

  // FeedSpy toolbar + sessions card injected
  assert.ok(window.document.querySelector('#spyFToolbar'), 'facebook toolbar present');
  assert.ok(window.document.querySelector('#spyPToolbar'), 'pinterest toolbar present');

  // error budget: ignore environment noise (fetch stubs) but no reference/syntax errors
  const fatal = errors.filter((m) => /is not defined|SyntaxError|TypeError/.test(m) && !/fetch/i.test(m));
  assert.deepEqual(fatal, []);
});
