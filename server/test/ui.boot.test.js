'use strict';
process.env.ORBITPRESS_ALLOW_HTTP = '1';
process.env.ORBITPRESS_DATA_DIR = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'orbitpress-ui-test-'));

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const PUBLIC = path.join(__dirname, '..', 'public');

const EMPTY_SETTINGS = {
  'site-default': {
    articleBaseUrl: '', articleModel: '', wordpressBaseUrl: '', wordpressUsername: '', categoryId: '',
    articleApiConfigured: false, wordpressConfigured: false, imageConfigured: false, pinterestConfigured: false,
    facebookConfigured: false, imageProvider: 'cloudflare', imageBaseUrl: '', imageAccountId: '', imageModel: '',
    pinterestBoardId: '', facebookGraphVersion: 'v23.0', textPrompt: '', imagePrompt: '', pinterestPrompt: '',
    articleImageCount: 0, scraperApiBaseUrl: '', scraperApiConfigured: false,
  },
};

/**
 * Boots the real shipped UI (index.html + bridge.js + feedspy.js) inside jsdom
 * with the same injection the Express server performs.
 */
/**
 * @param overrides partial boot payload
 * @param bridgeAnswer when set, POST /api/bridge/call is answered from it
 *        instead of hanging; without it the UI behaves as if offline.
 */
async function startUi(overrides, bridgeAnswer) {
  const raw = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
  const boot = {
    workspace: {
      keywords: [], drafts: [], draftVersions: [],
      logs: [{ id: 'l1', siteId: 'site-default', type: 'boot', message: 'ok', createdAt: Date.now() }],
      categories: [], theme: 'day', activeSiteId: 'site-default',
      siteProfiles: [{ id: 'site-default', name: 'Askinz' }],
      plan: { dailyCount: 5, firstHour: 8, scheduleEnabled: false },
    },
    settingsLock: { enabled: false },
    settings: EMPTY_SETTINGS,
    sessions: { facebook: { connected: false }, pinterest: { connected: false } },
    scheduler: { enabled: false, plan: null, recentRuns: [] },
    ...overrides,
  };
  const bridgeJs = fs.readFileSync(path.join(PUBLIC, 'app', 'bridge.js'), 'utf8');
  const feedspyJs = fs.readFileSync(path.join(PUBLIC, 'app', 'feedspy.js'), 'utf8');
  const pinStudioJs = fs.readFileSync(path.join(PUBLIC, 'app', 'pinStudio.js'), 'utf8');
  const injection = `<script>window.__BOOT__=${JSON.stringify(boot).replace(/</g, '\\u003c')};</script>\n<script>${bridgeJs}</script>`;
  const html = raw.replace('<body>', `<body>\n${injection}`);

  const errors = [];
  const dom = new JSDOM(html, {
    url: 'http://localhost:8080/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window) {
      // jsdom never decodes images: hand the studio an already-loaded one
      window.Image = class FakeImage {
        constructor() { this.onload = null; this.onerror = null; this.width = 1000; this.height = 1500; this.naturalWidth = 1000; this.naturalHeight = 1500; }
        set src(value) { this._src = value; setTimeout(() => { if (this.onload) this.onload(); }, 0); }
        get src() { return this._src; }
      };
      window.fetch = (url, options) => {
        if (!bridgeAnswer) return new Promise(() => {}); // pending forever: no network in these tests
        const request = JSON.parse((options && options.body) || '{}');
        const payload = bridgeAnswer(request, options, String(url)) || { ok: true };
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(payload) });
      };
      window.localStorage.clear();
    },
  });
  const { window } = dom;
  window.addEventListener('error', (event) => errors.push(event.error ? event.error.message : event.message));
  // run the deferred scripts manually (jsdom does not download them here)
  window.eval(pinStudioJs);
  window.eval(feedspyJs);
  window.document.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 100));
  return { window, errors, close: () => dom.window.close() };
}

function fatalErrors(errors) {
  return errors.filter((m) => /is not defined|SyntaxError|TypeError/.test(m) && !/fetch/i.test(m));
}

test('the web UI boots with the server bridge and FeedSpy layer', async () => {
  const promptDefaults = {
    articleSystem: 'DEFAULT EDITOR PERSONA',
    analyzer: 'DEFAULT {platform} ANALYZER',
    viralAr: 'DEFAULT VIRAL EXTRACTOR',
    feedspyAr: 'DEFAULT FEEDSPY REPORT',
    recipeRepairSystem: 'DEFAULT REPAIR PERSONA',
    recipeRepairInstruction: 'repair {count} recipes, issue {issue}',
  };
  const { window, errors, close } = await startUi({}, (request, options, url) => {
    if (String(url).includes('/api/prompt-defaults')) return { ok: true, defaults: promptDefaults };
    return request.type === 'diagnoseWordPress'
      ? { ok: true, steps: [{ label: 'users/me', url: 'https://wp.test/wp-json/wp/v2/users/me', status: 401, code: 'rest_not_logged_in', note: 'refused' }], advice: ['Check the Application Password.'] }
      : { ok: true };
  });

  assert.equal(window.document.querySelector('#screen-studio').classList.contains('active'), true, 'studio screen active');
  assert.equal(typeof window.Native === 'object', true, 'web bridge installed');
  // the inline app script parsed and ran: a syntax error would leave the boot
  // data in place while every handler silently disappeared
  assert.equal(typeof window.openDraft, 'function', 'the app script parsed and installed its handlers');
  assert.equal(typeof window.Native.openPinterestScanner === 'function', true);
  assert.equal(typeof window.Native.call === 'function', true);

  assert.equal(JSON.parse(window.Native.loadSettingsLock()).enabled, false);
  const settings = JSON.parse(window.Native.loadSettings('site-default'));
  assert.equal(settings.articleApiConfigured, false);

  // workspace round-trip is debounced (no fetch needed to complete for the API)
  window.Native.saveWorkspace(JSON.stringify({ theme: 'night', keywords: [], drafts: [], logs: [], categories: [], siteProfiles: [{ id: 'site-default', name: 'Askinz' }], activeSiteId: 'site-default', plan: {} }));
  assert.equal(JSON.parse(window.Native.loadWorkspace()).theme, 'night');

  assert.ok(window.document.querySelector('#spyFToolbar'), 'facebook toolbar present');
  assert.ok(window.document.querySelector('#spyPToolbar'), 'pinterest toolbar present');

  // the single Pinterest prompt field is now a library of editable templates
  const tplList = window.document.getElementById('pinterestPromptList');
  assert.ok(tplList, 'the Pinterest template manager is rendered');
  assert.equal(tplList.querySelectorAll('.prompt-template-row').length, 5, 'five default Pinterest prompt templates are offered');
  assert.ok(tplList.querySelector('.pt-prompt').value.includes('{{title}}'), 'templates use the {{title}} variable');

  // every AI prompt is customizable from Settings, prefilled with its default
  window.showScreen('settings');
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(window.document.getElementById('articleSystemPrompt').value, 'DEFAULT EDITOR PERSONA', 'the editor persona field shows its built-in default');
  assert.equal(window.document.getElementById('feedspyPrompt').value, 'DEFAULT FEEDSPY REPORT');
  assert.equal(window.document.getElementById('recipeRepairPrompt').value, 'repair {count} recipes, issue {issue}');
  const roleList = window.document.getElementById('articleRoleList');
  assert.ok(roleList, 'the ordered in-article shot editor exists');
  const nicheSelect = window.document.getElementById('roleNicheSelect');
  assert.ok(nicheSelect, 'a niche selector edits shots per niche');
  const roleRows = () => roleList.querySelectorAll('.prompt-template-row');
  assert.equal(roleRows().length, 6, 'six default shot roles: hero, ingredients, preparation, cooking, detail, lifestyle');
  const roleNames = () => [...roleRows()].map((row) => row.querySelector('.pt-name').value);
  assert.ok(roleNames().some((n) => n.includes('المقادير')), 'the ingredients shot is one of the editable roles');
  assert.ok(roleList.querySelector('.pt-prompt').value.includes('{{title}}') === false, 'built-in shots describe the moment directly');
  // other niches expose their own six shot tables
  const rolePromptValues = () => [...roleList.querySelectorAll('.pt-prompt')].map((t) => t.value);
  nicheSelect.value = 'crochet';
  nicheSelect.dispatchEvent(new window.Event('change', { bubbles: true }));
  assert.ok(rolePromptValues().some((p) => /yarn/i.test(p)), 'crochet shots talk about yarn and hooks, not food');
  nicheSelect.value = 'gardening';
  nicheSelect.dispatchEvent(new window.Event('change', { bubbles: true }));
  assert.ok(rolePromptValues().some((p) => /garden/i.test(p)), 'gardening shots describe gardening moments');
  nicheSelect.value = 'food';
  nicheSelect.dispatchEvent(new window.Event('change', { bubbles: true }));
  // editing one shot and reading the form surfaces the override payload
  roleRows()[2].querySelector('.pt-prompt').value = 'HANDS KNEADING DOUGH for {{title}}, no text';
  roleRows()[2].querySelector('.pt-prompt').dispatchEvent(new window.Event('input', { bubbles: true }));
  assert.ok(window.document.querySelector('[data-reset-prompt]'), 'each prompt offers a reset-to-default button');

  // additional in-article images describe DIFFERENT moments (hero / ingredients / preparation)
  const recipeDraft = { title: 'Easy Sourdough Bread', niche: 'food', recipe: { ingredients: ['500g flour', '300ml water', '10g salt'] } };
  const p0 = window.additionalArticleImagePrompt(recipeDraft, 0);
  const p1 = window.additionalArticleImagePrompt(recipeDraft, 1);
  const p2 = window.additionalArticleImagePrompt(recipeDraft, 2);
  assert.match(p0, /hero photograph/i, 'image 1 is the finished-dish hero');
  assert.match(p1, /flat lay of the raw ingredients/i, 'image 2 is the ingredients flat lay');
  assert.match(p1, /500g flour/i, 'the ingredients shot names the recipe ingredients');
  assert.match(p2, /Hands preparing/i, 'image 3 is the hands-on preparation');
  assert.notEqual(p0, p1);
  assert.notEqual(p1, p2, 'the three prompts never repeat');
  assert.match(window.additionalArticleImagePrompt({ title: 'Herb Garden', niche: 'gardening' }, 1), /gardening supplies/i, 'other niches get their own role table');
  assert.equal(window.pinterestTemplateList().length, 5, 'five default pin background templates');

  // the WordPress card can diagnose a refused connection, not just report 401
  assert.ok(window.document.getElementById('diagnoseWordPress'), 'diagnose button present');
  window.document.getElementById('diagnoseWordPress').click();
  await new Promise((resolve) => setTimeout(resolve, 60));
  const box = window.document.getElementById('wpDiagnostics');
  assert.equal(box.hidden, false, 'the report box appears');
  assert.match(box.textContent, /What to do/, 'an unanswered connection still gets actionable advice');
  assert.deepEqual(fatalErrors(errors), []);
  close(); // release jsdom timers so the test run does not wait for them
});

test('the pin studio offers a composed pin for a draft that has a Pinterest image', async () => {
  const draft = {
    id: 'd1', siteId: 'site-default', keywordId: 'k1', title: 'Easy Sourdough Bread | Askinz',
    metaDescription: 'A crisp crust with four ingredients.', contentType: 'recipe',
    recipe: { prepTime: '20 min', cookTime: '40 min', recipeYield: '8 slices' },
    slug: 'easy-sourdough-bread', htmlContent: '<p>Hello</p>', outline: [], internalLinks: [],
    images: { featured: 'local://featured.png', pinterest: 'local://pinterest.png' },
    generationStatus: 'generated', publishedUrl: 'https://www.askinz.com/easy-sourdough-bread/',
    createdAt: Date.now(),
  };
  const { window, errors, close } = await startUi({
    workspace: {
      keywords: [{ id: 'k1', siteId: 'site-default', keyword: 'sourdough bread', status: 'drafted', draftId: 'd1', categoryId: '3', categoryName: 'Bread', priority: 'high', contentType: 'recipe', createdAt: Date.now() }],
      drafts: [draft], draftVersions: [],
      logs: [{ id: 'l1', siteId: 'site-default', type: 'boot', message: 'ok', createdAt: Date.now() }],
      categories: [{ id: '3', siteId: 'site-default', name: 'Bread' }], theme: 'day', activeSiteId: 'site-default',
      siteProfiles: [{ id: 'site-default', name: 'Askinz' }],
      plan: { dailyCount: 5, firstHour: 8, scheduleEnabled: false },
    },
    settings: { 'site-default': { ...EMPTY_SETTINGS['site-default'], wordpressBaseUrl: 'https://www.askinz.com', pinterestBoardId: 'https://www.pinterest.com/askinz/bread/' } },
  }, (request) => {
    if (request.type === 'loadImage') return { ok: true, dataUrl: 'data:image/png;base64,' + require('./mockServers').tinyPng(1000, 1500).toString('base64') };
    return { ok: true };
  });
  const { document } = window;

  window.openDraft('d1');
  await new Promise((resolve) => setTimeout(resolve, 150)); // the studio loads the background asynchronously
  const card = document.getElementById('pinStudioCard');
  assert.ok(card, 'the pin studio card is rendered on the review screen');
  assert.equal(document.getElementById('pinHeadline').value, 'Easy Sourdough Bread');
  assert.equal(document.getElementById('pinBrand').value, 'askinz.com');
  assert.equal(document.getElementById('pinChips').value, '20 min prep, 40 min cook, Serves 8 slices');
  assert.equal(document.getElementById('pinCta').value, 'Full recipe');
  assert.equal(document.getElementById('pinPublish').disabled, false, 'a published URL unlocks publishing');
  assert.ok(card.textContent.includes('https://www.pinterest.com/askinz/bread/'), 'the board is shown so the destination is never a guess');
  assert.equal(document.querySelectorAll('[data-pin-template]').length, 7, 'three classic plus four pro templates are offered');
  const bgTemplates = document.getElementById('pinPromptTemplate');
  assert.ok(bgTemplates, 'the studio offers a background prompt template picker');
  assert.ok(bgTemplates.options.length >= 5, 'all saved Pinterest prompt templates are selectable');
  bgTemplates.value = '3';
  bgTemplates.dispatchEvent(new window.Event('change', { bubbles: true }));
  assert.equal(bgTemplates.value, '3', 'another background template can be selected before regenerating');

  // switching template keeps the design on the draft, not only in the DOM
  document.querySelector('[data-pin-template="card"]').click();
  await new Promise((resolve) => setTimeout(resolve, 800)); // design autosave is debounced
  const saved = JSON.parse(window.Native.loadWorkspace()).drafts.find((item) => item.id === 'd1');
  assert.equal(saved.pinDesign.template, 'card', 'the design travels with the draft');

  // the article preview offers both readings of the same draft
  assert.ok(document.getElementById('previewModePublished'), 'published preview toggle');
  document.getElementById('previewModeDraft').click();
  assert.match(document.getElementById('previewNote').textContent, /exactly as it was generated/i);
  assert.ok(document.getElementById('articlePreview').innerHTML.includes('Hello'));

  // clicking a stored image opens the lightbox over the whole draft gallery
  assert.equal(document.getElementById('lightbox').hidden, true);
  document.getElementById('featuredPreview').click();
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(document.getElementById('lightbox').hidden, false, 'the lightbox opened');
  assert.match(document.getElementById('lightboxTitle').textContent, /Featured image/);
  assert.match(document.getElementById('lightboxTitle').textContent, /1 of 3/, 'featured, pinterest and the live pin');
  assert.ok(document.getElementById('lightboxDownload').getAttribute('download').includes('easy-sourdough-bread'));
  document.getElementById('lightboxNext').click();
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.match(document.getElementById('lightboxTitle').textContent, /2 of 3/, 'the gallery moves through every image');
  window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
  assert.equal(document.getElementById('lightbox').hidden, true, 'Escape closes it again');
  assert.deepEqual(fatalErrors(errors), []);
  close();
});

test('pro pin templates compose AI photo slots and the settings toggle hides the studio', async () => {
  const draft = {
    id: 'd2', siteId: 'site-default', keywordId: 'k2',
    title: 'أربع وصفات خريفية باليقطين', metaDescription: 'وصفات سريعة', contentType: 'recipe',
    recipes: [
      { title: 'قهوة اليقطين', ingredients: ['قهوة', 'حليب', 'يقطين', 'قرفة'], instructions: ['a'] },
      { title: 'كعكة اليقطين', ingredients: ['دقيق', 'سكر', 'يقطين'], instructions: ['b'] },
    ],
    slug: 'pumpkin-recipes', htmlContent: '<p>Hello</p>', outline: [], internalLinks: [],
    images: { featured: 'local://featured.png', pinterest: 'local://pinterest.png' },
    generationStatus: 'generated', publishedUrl: 'https://www.askinz.com/pumpkin/',
    createdAt: Date.now(),
  };
  const { window, errors, close } = await startUi({
    workspace: {
      keywords: [{ id: 'k2', siteId: 'site-default', keyword: 'وصفات اليقطين', status: 'drafted', draftId: 'd2', categoryId: '3', categoryName: 'وصفات', priority: 'high', contentType: 'recipe', createdAt: Date.now() }],
      drafts: [draft], draftVersions: [],
      logs: [], categories: [{ id: '3', siteId: 'site-default', name: 'وصفات' }], theme: 'day', activeSiteId: 'site-default',
      siteProfiles: [{ id: 'site-default', name: 'Askinz' }],
      plan: { dailyCount: 5, firstHour: 8, scheduleEnabled: false },
    },
    settings: { 'site-default': { ...EMPTY_SETTINGS['site-default'], imageConfigured: true, pinterestBoardId: 'https://www.pinterest.com/askinz/food/' } },
  }, (request) => {
    if (request.type === 'loadImage' || request.type === 'generateImage') {
      return { ok: true, dataUrl: 'data:image/png;base64,' + require('./mockServers').tinyPng(64, 64).toString('base64') };
    }
    return { ok: true };
  });
  const { document } = window;
  // jsdom has no 2d canvas backend: give the studio a permissive drawing stub
  // so AI photos can be cover-fitted and composed in the test environment.
  const noopCtx = new Proxy({}, {
    get: (t, prop) => {
      if (prop === 'measureText') return () => ({ width: 40 });
      if (prop === 'createLinearGradient') return () => ({ addColorStop() {} });
      if (typeof t[prop] !== 'undefined') return t[prop];
      return () => {};
    },
    set: () => true,
  });
  window.HTMLCanvasElement.prototype.getContext = function getContext() { return noopCtx; };
  window.HTMLCanvasElement.prototype.toDataURL = function toDataURL() { return 'data:image/png;base64,' + require('./mockServers').tinyPng(8, 8).toString('base64'); };

  window.openDraft('d2');
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.ok(document.getElementById('pinStudioCard'), 'the studio is on by default');

  document.querySelector('[data-pin-template="ways"]').click();
  await new Promise((resolve) => setTimeout(resolve, 200));
  const slots = document.querySelectorAll('#pinSlotsGrid .pin-slot');
  assert.equal(slots.length, 2, 'one editable photo slot per recipe in the roundup');
  assert.equal(document.querySelectorAll('[data-pin-palette]').length, 6, 'six curated color palettes are offered');
  const firstLabel = document.querySelector('#pinSlotsGrid [data-slot-label]');
  assert.match(firstLabel.value, /قهوة اليقطين/, 'slot labels come from the recipe titles');
  assert.match(document.querySelector('#pinSlotsGrid [data-slot-ingredients]').value, /قرفة/, 'ingredients travel into the slot checklist');

  // AI generation fills the first slot and marks it ready
  document.querySelector('#pinSlotsGrid [data-slot-ai]').click();
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.match(document.querySelector('#pinSlotsGrid .pin-slot').textContent, /جاهزة/, 'AI photo is composed into the slot');

  // checklist template exposes the ingredient checklist editor
  document.querySelector('[data-pin-template="checklist"]').click();
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.equal(document.querySelectorAll('#pinSlotsGrid .pin-slot').length, 1, 'the checklist template uses one hero photo');
  assert.ok(document.getElementById('pinHeadline'), 'common headline controls remain for pro templates');

  // disabled studio disappears from the review screen
  close();
  const off = await startUi({
    workspace: {
      keywords: [{ id: 'k2', siteId: 'site-default', keyword: 'وصفات اليقطين', status: 'drafted', draftId: 'd2', categoryId: '3', categoryName: 'وصفات', priority: 'high', contentType: 'recipe', createdAt: Date.now() }],
      drafts: [{ ...draft }], draftVersions: [],
      logs: [], categories: [{ id: '3', siteId: 'site-default', name: 'وصفات' }], theme: 'day', activeSiteId: 'site-default',
      siteProfiles: [{ id: 'site-default', name: 'Askinz' }],
      plan: { dailyCount: 5, firstHour: 8, scheduleEnabled: false },
    },
    settings: { 'site-default': { ...EMPTY_SETTINGS['site-default'], pinStudioEnabled: false } },
  }, () => ({ ok: true }));
  off.window.openDraft('d2');
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(off.window.document.getElementById('pinStudioCard'), null, 'pin studio is hidden when the tenant disabled it');
  assert.ok(off.window.document.getElementById('pinStudioEnabled'), 'the settings screen still carries the on/off switch');
  assert.deepEqual(fatalErrors(errors), []);
  off.close();
});

test('admin console is owner-only and renders users, oversight and audit', async () => {
  const overview = {
    ok: true,
    totals: { users: 2, active: 1, blocked: 1, bytes: 4096 },
    users: [
      { id: 'u1', name: 'محمود', note: 'وصفات', status: 'active', codeTail: 'AB', createdAt: '2026-09-01T08:00:00Z', lastSeenAt: '2026-09-10T08:00:00Z', seenCount: 4, storage: { bytes: 3072, files: 2 } },
      { id: 'u2', name: 'سفيان', note: '', status: 'blocked', codeTail: 'CD', createdAt: '2026-09-02T08:00:00Z', lastSeenAt: null, seenCount: 0, storage: { bytes: 1024, files: 1 } },
    ],
    audit: [
      { at: '2026-09-10T09:00:00Z', action: 'user.created', id: 'u1', name: 'محمود' },
      { at: '2026-09-10T10:00:00Z', action: 'auth.invalid_code', tail: 'ZZ' },
      { at: '2026-09-10T11:00:00Z', action: 'admin.workspace_viewed', id: 'u1', name: 'محمود' },
    ],
  };
  const { window, errors, close } = await startUi({ auth: { role: 'owner', user: null } }, (request, options, url) => {
    url = String(url);
    if (url.includes('/api/admin/users') && !url.includes('/workspace') && (!options || options.method === 'POST')) {
      return { ok: true, user: overview.users[0], code: 'AB12-C3D4E' };
    }
    if (url.includes('/api/admin/users/u1/workspace')) {
      return {
        ok: true,
        user: overview.users[0],
        workspace: {
          siteProfiles: [{ id: 'site-default', name: 'Askinz' }],
          drafts: [{ id: 'd1', title: 'مقال حصري', status: 'مسودة', createdAt: '2026-09-09T08:00:00Z', html: '<p>محتوى المستخدم</p><script>alert(1)</script><img src="/api/images/x.jpg?siteId=site-default">' }],
          reviewQueue: [],
          keywords: ['كسكس', 'طاجين'],
        },
        settings: { 'site-default': { articleApiConfigured: true, wordpressConfigured: true, wordpressBaseUrl: 'https://wp.test', imageConfigured: false, pinterestConfigured: false, facebookConfigured: false } },
        sessions: { pinterest: { connected: true } },
      };
    }
    if (url.includes('/api/admin/')) return overview;
    return { ok: true };
  });
  const { document } = window;

  // Owner sees the admin menu item and the admin module loaded
  assert.equal(document.getElementById('navAdmin').style.display, '', 'owner sees the admin nav item');
  assert.equal(typeof window.renderAdmin, 'function', 'admin renderer installed');

  window.showScreen('admin');
  await new Promise((resolve) => setTimeout(resolve, 80));
  const cards = document.querySelectorAll('.admin-user-card');
  assert.equal(cards.length, 2, 'both users render as cards');
  assert.ok(document.querySelector('.admin-user-card.is-blocked'), 'the blocked user card is marked');
  assert.ok(document.getElementById('adminUsersList').textContent.includes('محمود'));
  assert.ok(document.getElementById('adminAuditList').textContent.includes('رمز دخول مرفوض'), 'audit actions carry Arabic labels');

  // Creating a user reveals the one-time code exactly once
  document.getElementById('newUserName').value = 'محمود';
  document.getElementById('createUserBtn').click();
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(document.getElementById('newCodeBox').style.display, 'block', 'the one-time code box appears');
  assert.equal(document.getElementById('newCodeText').textContent, 'AB12-C3D4E');

  // Oversight opens the tenant's full content, sanitized and image-proxied
  document.querySelector('[data-view="u1"]').click();
  await new Promise((resolve) => setTimeout(resolve, 80));
  const body = document.getElementById('adminOversightBody');
  assert.ok(body.textContent.includes('مقال حصري'), 'the tenant draft title is shown');
  assert.ok(body.textContent.includes('محتوى المستخدم'), 'the tenant draft body is shown');
  assert.ok(body.textContent.includes('كسكس'), 'tenant keywords are shown');
  assert.ok(body.innerHTML.includes('/api/admin/users/u1/images/'), 'tenant image URLs are rewritten to the owner proxy');
  assert.ok(!body.innerHTML.includes('<script>'), 'tenant HTML is sanitized before display');
  assert.ok(body.textContent.includes('ذكاء اصطناعي'), 'configured services are summarized');
  assert.ok(!body.textContent.includes('appPassword'), 'no secrets leak into oversight');
  assert.deepEqual(fatalErrors(errors), []);
  close();

  // A code-holding user must never see the admin surface
  const userView = await startUi({ auth: { role: 'user', user: { id: 'u9', name: 'زائر' } } }, () => ({ ok: true }));
  assert.equal(userView.window.document.getElementById('navAdmin'), null, 'the admin nav is removed for users');
  assert.equal(typeof userView.window.renderAdmin, 'undefined', 'no admin renderer for users');
  userView.close();
});

test('unpublished drafts show prominent Arabic AI image buttons for tenants', async () => {
  const { window, close } = await startUi({
    auth: { role: 'user', user: { id: 'u9', name: 'مستخدم' } },
    workspace: {
      keywords: [],
      drafts: [{
        id: 'd1', title: 'كسكس سهل', slug: 'easy-couscous', contentType: 'article',
        htmlContent: '<p>مقدمة</p>', generationStatus: 'ready',
        images: { featured: null, pinterest: null },
      }],
      draftVersions: [], logs: [], categories: [], theme: 'day',
      activeSiteId: 'site-default',
      siteProfiles: [{ id: 'site-default', name: 'Askinz' }],
      plan: { dailyCount: 5, firstHour: 8, scheduleEnabled: false },
    },
    settings: { 'site-default': { ...EMPTY_SETTINGS['site-default'], imageConfigured: true } },
  }, () => ({ ok: true }));
  const { document } = window;
  window.openDraft('d1');
  await new Promise((resolve) => setTimeout(resolve, 80));
  const featured = document.getElementById('generateFeatured');
  const pin = document.getElementById('generatePinterest');
  assert.ok(featured, 'featured AI button is present');
  assert.ok(pin, 'pinterest AI button is present');
  assert.match(featured.textContent, /توليد الصورة الرئيسية/, 'featured button carries an Arabic AI label');
  assert.match(pin.textContent, /توليد صورة Pinterest/, 'pinterest button carries an Arabic AI label');
  // a tenant must never see the admin entry point
  assert.equal(document.getElementById('navAdmin'), null);
  close();
});

test('large workspace saves avoid the 64 KB keepalive request cap', async () => {
  const workspaceSaves = [];
  const { window, close } = await startUi({}, (request, options, url) => {
    if (String(url).includes('/api/workspace')) workspaceSaves.push({ options, body: options && options.body });
    return { ok: true };
  });
  // A single generated article (HTML + recipe cards + outline) easily makes
  // the workspace larger than the browser's 64 KB keepalive quota.
  const big = 'x'.repeat(90000);
  window.Native.saveWorkspace(JSON.stringify({
    theme: 'day', keywords: [], logs: [], categories: [],
    siteProfiles: [{ id: 'site-default', name: 'Askinz' }], activeSiteId: 'site-default', plan: {},
    drafts: [{ id: 'd1', title: 'Big article', htmlContent: big }],
  }));
  await new Promise((resolve) => setTimeout(resolve, 700)); // debounce is 350 ms
  assert.ok(workspaceSaves.length >= 1, 'the workspace was flushed to the server');
  const save = workspaceSaves.at(-1);
  assert.equal(save.options.keepalive, undefined, 'normal saves must not use keepalive (64 KB browser cap)');
  assert.ok(save.body.length > 64 * 1024, 'the saved payload itself exceeds the keepalive quota');
  close();
});
