'use strict';
/**
 * routes.js — HTTP API that replaces the Android Native bridge.
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const store = require('./store');
const wordpress = require('./wordpress');
const images = require('./images');
const article = require('./article');
const socialapi = require('./socialapi');
const scraper = require('./scraper');
const scheduler = require('./scheduler');
const users = require('./users');
const reqContext = require('./reqContext');

const router = express.Router();

// Admin surface is only reachable with the master owner token; issued access
// codes (even if compromised) can never manage other users.
function requireOwner(req, res, next) {
  if (!reqContext.isOwner()) return res.status(403).json({ ok: false, message: 'هذه الصفحة مخصصة للمدير فقط.' });
  next();
}

function asyncRoute(handler) {
  return (req, res) => {
    Promise.resolve()
      .then(() => handler(req, res))
      .catch((error) => {
        // The bridge protocol normally returns ok:false payloads with HTTP 200,
        // but the admin REST endpoints annotate validation/not-found errors
        // with an explicit status (400/403/404) which must pass through.
        const explicit = error && (error.status || error.statusCode);
        const status = [400, 401, 403, 404].includes(explicit) ? explicit : 200;
        res.status(status).json({ ok: false, message: error && error.message ? error.message : 'An unexpected error occurred.' });
      });
  };
}

// ---------------------------------------------------------------------------
// Bootstrap / workspace / settings / lock (sync bridge replacements)
// ---------------------------------------------------------------------------

router.get('/bootstrap', (req, res) => {
  res.json({
    auth: {
      role: reqContext.isOwner() ? 'owner' : 'user',
      user: (req.auth && req.auth.profile) || null,
    },
    workspace: store.loadWorkspace(),
    settingsLock: store.loadSettingsLock(),
    settings: store.allSettingsSummaries(),
    sessions: scraper.sessions.statuses(),
    scheduler: scheduler.status(),
    server: { edition: 'server', version: '4.0.0' },
  });
});

const saveWorkspaceHandler = asyncRoute(async (req, res) => {
  store.saveWorkspace(req.body && req.body.workspace !== undefined ? req.body.workspace : req.body);
  res.json({ ok: true });
});
// POST accepted as well because beforeunload flushes via navigator.sendBeacon (POST only).
router.put('/workspace', saveWorkspaceHandler);
router.post('/workspace', saveWorkspaceHandler);

router.get('/settings', (req, res) => {
  res.json(store.getSettingsSummary(req.query.siteId || 'site-default'));
});

// Built-in prompt library: lets the Settings UI prefill and reset the
// customizable AI prompts without duplicating the defaults in the client.
router.get('/prompt-defaults', (req, res) => {
  res.json({ ok: true, defaults: article.PROMPT_DEFAULTS });
});

// Who is signed in on this browser/session.
router.get('/me', (req, res) => {
  const id = reqContext.getUserId();
  res.json({
    ok: true,
    role: reqContext.isOwner() ? 'owner' : 'user',
    userId: id || 'owner',
    user: (req.auth && req.auth.profile) || null,
  });
});

// --- admin: user registry, content oversight, audit (master token only) ---
router.get('/admin/overview', requireOwner, (req, res) => {
  res.json({ ok: true, ...users.overview(), audit: users.readAudit(60) });
});

router.get('/admin/users', requireOwner, (req, res) => {
  res.json({ ok: true, users: users.listUsers() });
});

router.post('/admin/users', requireOwner, asyncRoute(async (req, res) => {
  const name = String((req.body && req.body.name) || '').trim();
  const note = String((req.body && req.body.note) || '').trim();
  if (!name) {
    const err = new Error('اكتب اسم المستخدم أولاً (مثال: محمود - موقع وصفات).');
    err.status = 400;
    throw err;
  }
  const created = users.createUser({ name, note }, 'owner');
  res.json({ ok: true, ...created });
}));

router.post('/admin/users/:id/status', requireOwner, asyncRoute(async (req, res) => {
  const status = String((req.body && req.body.status) || '').trim();
  res.json({ ok: true, user: users.setStatus(req.params.id, status) });
}));

router.post('/admin/users/:id/reset-code', requireOwner, asyncRoute(async (req, res) => {
  res.json({ ok: true, ...users.resetCode(req.params.id) });
}));

// Content oversight for legal/compliance review: the admin can open the
// complete workspace of any user (drafts, articles, keywords, activity).
// Secret API keys/passwords are never returned — only a configured/unset
// summary — and every oversight read is written to the audit log.
router.get('/admin/users/:id/workspace', requireOwner, asyncRoute(async (req, res) => {
  const target = users.listUsers().find((u) => u.id === req.params.id);
  if (!target) return res.status(404).json({ ok: false, message: 'المستخدم غير موجود.' });
  const result = reqContext.runAs(target.id, () => {
    const workspace = store.loadWorkspace();
    const settings = store.allSettingsSummaries ? store.allSettingsSummaries() : {};
    const sessions = scraper.sessions.statuses();
    return { workspace, settings, sessions };
  });
  const debug = tenantDebugFiles(target.id);
  users.audit('admin.workspace_viewed', { id: target.id, name: target.name });
  res.json({ ok: true, user: target, ...result, debug });
}));

// Owner-only view of a tenant's stored images so draft previews render
// during a legal/compliance review (the regular /images route is scoped
// to the caller's own data directory).
router.get('/admin/users/:id/images/:filename', requireOwner, (req, res) => {
  const target = users.listUsers().find((u) => u.id === req.params.id);
  if (!target) return res.status(404).json({ ok: false, message: 'المستخدم غير موجود.' });
  const siteId = String(req.query.siteId || 'site-default');
  let filename;
  try {
    filename = images.safeImageFilename(`local://${req.params.filename}`);
  } catch {
    return res.status(404).json({ ok: false, message: 'Image not found.' });
  }
  const file = reqContext.runAs(target.id, () =>
    path.join(images.imageDirectory(siteId), filename));
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    return res.status(404).json({ ok: false, message: 'This image is no longer stored on this server.' });
  }
  const extension = filename.split('.').pop().toLowerCase();
  res.setHeader('Content-Type', extension === 'jpg' ? 'image/jpeg' : `image/${extension}`);
  res.setHeader('Cache-Control', 'private, max-age=600');
  fs.createReadStream(file).pipe(res);
});

// Diagnostic snapshots (Pinterest/Facebook login + scans) saved inside the
// tenant's data/debug folder: the owner can list and open them when a user
// reports a login wall or a different platform layout.
function tenantDebugFiles(userId) {
  return reqContext.runAs(userId, () => {
    const dir = path.join(reqContext.getDataDir(), 'debug');
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
      .filter((name) => fs.statSync(path.join(dir, name)).isFile())
      .map((name) => {
        const stat = fs.statSync(path.join(dir, name));
        return { name, size: stat.size, mtime: stat.mtime.toISOString() };
      })
      .sort((a, b) => b.mtime.localeCompare(a.mtime))
      .slice(0, 60);
  });
}

router.get('/admin/users/:id/debug', requireOwner, (req, res) => {
  const target = users.listUsers().find((u) => u.id === req.params.id);
  if (!target) return res.status(404).json({ ok: false, message: 'المستخدم غير موجود.' });
  res.json({ ok: true, files: tenantDebugFiles(target.id) });
});

router.get('/admin/users/:id/debug/:filename', requireOwner, (req, res) => {
  const target = users.listUsers().find((u) => u.id === req.params.id);
  if (!target) return res.status(404).json({ ok: false, message: 'المستخدم غير موجود.' });
  // Only flat debug snapshot files; never allow path traversal.
  const filename = path.basename(String(req.params.filename || ''));
  if (!/^[A-Za-z0-9._-]+\.(png|html|txt)$/.test(filename)) {
    return res.status(404).json({ ok: false, message: 'اللقطة غير موجودة.' });
  }
  const file = reqContext.runAs(target.id, () => path.join(reqContext.getDataDir(), 'debug', filename));
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    return res.status(404).json({ ok: false, message: 'اللقطة لم تعد موجودة على الخادم.' });
  }
  if (filename.endsWith('.png')) res.setHeader('Content-Type', 'image/png');
  else if (filename.endsWith('.html')) res.setHeader('Content-Type', 'text/html; charset=utf-8');
  else res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'private, max-age=60');
  fs.createReadStream(file).pipe(res);
});

router.get('/admin/audit', requireOwner, (req, res) => {
  res.json({ ok: true, entries: users.readAudit(Number(req.query.limit) || 200) });
});

router.put('/settings', asyncRoute(async (req, res) => {
  const incoming = req.body && req.body.settings ? req.body.settings : req.body;
  const json = JSON.stringify(incoming || {});
  if (json.length > 30000) throw new Error('Settings payload is too large.');
  store.saveSiteSettings(JSON.parse(json), (req.body && req.body.siteId) || 'site-default');
  res.json({ ok: true, summary: store.getSettingsSummary((req.body && req.body.siteId) || 'site-default') });
}));

router.get('/lock', (req, res) => {
  res.json(store.loadSettingsLock());
});

router.post('/lock', asyncRoute(async (req, res) => {
  store.saveSettingsLock(req.body && req.body.pin != null ? req.body.pin : '');
  res.json({ ok: true, ...store.loadSettingsLock() });
}));

router.post('/lock/verify', (req, res) => {
  res.json({ ok: store.verifySettingsLock(req.body && req.body.pin) });
});

// ---------------------------------------------------------------------------
// Bridge call — mirrors the Android Native.call dispatch 1:1
// ---------------------------------------------------------------------------

const BRIDGE_OPERATIONS = {
  analyzeSocialKeywords: (req) => article.analyzeSocialKeywords(req),
  analyzePinterestKeywords: (req) => article.analyzePinterestKeywords(req),
  viralKeywords: (req) => article.viralKeywords(req),
  testArticleApi: (req) => article.testArticleApi(req),
  testImageApi: (req) => wordpress.testImageApi(req),
  facebookGraphScan: (req) => socialapi.facebookGraphScan(req),
  pinterestApiScan: (req) => socialapi.pinterestApiScan(req),
  scraperFacebook: (req) => socialapi.scraperScan(req, 'facebook'),
  scraperPinterest: (req) => socialapi.scraperScan(req, 'pinterest'),
  generate: (req) => article.generate(req),
  categories: (req) => wordpress.categories(req),
  syncPublishedPosts: (req) => wordpress.syncPublishedPosts(req),
  testConnection: (req) => wordpress.testConnection(req),
  diagnoseWordPress: (req) => wordpress.diagnoseWordPress(req),
  storeImage: (req) => images.storeImage(req),
  loadImage: (req) => images.loadImage(req),
  removeImage: (req) => images.removeImage(req),
  repairPreview: (req) => wordpress.repairPreview(req),
  previewArticle: (req) => wordpress.previewArticle(req),
  seoScan: (req) => wordpress.seoScan(req),
  repairApply: (req) => wordpress.repairApply(req),
  generateImage: (req) => wordpress.generateImage(req),
  publishPinterest: (req) => wordpress.publishPinterest(req),
  publish: (req) => wordpress.publish(req),
};

/**
 * Stored images, served to the browser for previews. The filename is the
 * local:// reference the workspace carries; anything else is rejected, so
 * this cannot be used to read arbitrary files from the data directory.
 */
router.get('/images/:filename', (req, res) => {
  const siteId = String(req.query.siteId || 'site-default');
  let filename;
  try {
    filename = images.safeImageFilename(`local://${req.params.filename}`);
  } catch {
    return res.status(404).json({ ok: false, message: 'Image not found.' });
  }
  const file = path.join(images.imageDirectory(siteId), filename);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    return res.status(404).json({ ok: false, message: 'This image is no longer stored on this server.' });
  }
  const extension = filename.split('.').pop().toLowerCase();
  res.setHeader('Content-Type', extension === 'jpg' ? 'image/jpeg' : `image/${extension}`);
  res.setHeader('Cache-Control', 'private, max-age=600');
  fs.createReadStream(file).pipe(res);
});

router.post('/bridge/call', asyncRoute(async (req, res) => {
  const request = req.body || {};
  const operation = BRIDGE_OPERATIONS[String(request.type || '')];
  if (!operation) throw new Error('Unknown operation.');
  const result = await operation(request);
  // `ok` is the transport flag: nativeCall rejects when it is false. An
  // operation that reports a *verdict* of its own — a probe that failed on
  // purpose, like the WordPress diagnostic or the API test buttons — must not
  // be able to turn its own finding into a transport failure, which is what
  // happened when the payload spread overrode ok:true and the UI showed a
  // bare "Request failed." instead of the report.
  const payload = result && typeof result === 'object' ? { ...result } : { result };
  const envelope = { ok: true, ...payload, ok: true };
  if (payload.ok === false) envelope.verdict = false;
  res.json(envelope);
}));

// ---------------------------------------------------------------------------
// Built-in scraper jobs (the "no API, no cookies upload" path)
// ---------------------------------------------------------------------------

router.post('/scraper/jobs', asyncRoute(async (req, res) => {
  const job = scraper.startScanJob(req.body || {});
  res.json({ ok: true, jobId: job.id, status: job.status });
}));

router.get('/scraper/jobs/:id', (req, res) => {
  const job = scraper.getJob(req.params.id);
  if (!job) return res.status(404).json({ ok: false, message: 'Scan job expired or never existed. Start a new scan.' });
  res.json({
    ok: true,
    status: job.status,
    progress: job.progress,
    message: job.message,
    platform: job.platform,
    result: job.status === 'done' ? job.result : null,
    error: job.status === 'error' ? job.error : null,
  });
});

/** FeedSpy re-query: period/sort/search/min-max over cached scan posts. */
router.post('/scraper/jobs/:id/query', asyncRoute(async (req, res) => {
  const queried = scraper.queryJobPosts(req.params.id, req.body || {});
  if (!queried) throw new Error('Scan job expired or has no results. Start a new scan.');
  res.json({ ok: true, ...queried });
}));

router.get('/scraper/jobs/:id/export.csv', (req, res) => {
  const queried = scraper.queryJobPosts(req.params.id, req.query || {});
  if (!queried) return res.status(404).json({ ok: false, message: 'Scan job expired or has no results.' });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="orbitpress-${queried.platform}-export.csv"`);
  res.send('﻿' + scraper.analyzer.toCsv(queried.posts));
});

// ---------------------------------------------------------------------------
// Server-side social sessions (login without API keys or cookie uploads)
// ---------------------------------------------------------------------------

router.get('/sessions', (req, res) => {
  res.json({ ok: true, ...scraper.sessions.statuses() });
});

router.post('/sessions/:platform/login', asyncRoute(async (req, res) => {
  // Returns either { connected:true } or { status:'verification_required', challenge }
  const status = await scraper.sessions.login(req.params.platform, req.body || {});
  res.json({ ok: true, ...status });
}));

// Re-validate a stored session against the live site (refreshes connected flag)
router.post('/sessions/:platform/verify', asyncRoute(async (req, res) => {
  const status = await scraper.sessions.verifyConnected(req.params.platform);
  res.json({ ok: true, ...status });
}));

// Seed the session with cookies copied from the user's own browser (the
// reliable path when the headless server browser is shown a CAPTCHA wall).
router.post('/sessions/:platform/cookies', asyncRoute(async (req, res) => {
  const raw = req.body && (req.body.cookies || req.body.raw || '');
  const status = await scraper.sessions.importCookies(req.params.platform, raw);
  res.json({ ok: true, ...status });
}));

// List the connected account's Pinterest boards for the Settings picker.
router.get('/sessions/:platform/boards', asyncRoute(async (req, res) => {
  const platform = String(req.params.platform || '').toLowerCase();
  if (platform !== 'pinterest') {
    return res.status(400).json({ ok: false, message: 'قائمة اللوحات متاحة لـ Pinterest فقط.' });
  }
  const cookieHeader = await scraper.sessions.cookieHeader('pinterest').catch(() => '');
  if (!cookieHeader || !/_pinterest_sess=/.test(cookieHeader)) {
    return res.json({ ok: false, stage: 'session', message: 'لا توجد جلسة Pinterest متصلة — اربط الحساب من البطاقة أولاً.' });
  }
  const publisher = require('./scraper/pinterestPublish');
  const mirrorHosts = publisher.hosts();
  // The username is only cosmetic; never let its probe block the listing,
  // since the boards resources themselves require a signed-in session and
  // are therefore the real functional proof.
  let me = '';
  try {
    me = await publisher.sessionAlive(mirrorHosts, cookieHeader);
  } catch { /* the listing below proves the session either way */ }
  let listed;
  try {
    listed = await publisher.listMyBoards(mirrorHosts, cookieHeader, me || '');
  } catch (error) {
    return res.json({ ok: false, stage: 'session', message: error.message || 'رفض Pinterest جلسة المتصفح (كود 2). اقطع الاتصال وأعد الدخول أو استورد الكوكيز.' });
  }
  if (!listed.boards.length) {
    if (!listed.username) {
      return res.json({ ok: false, stage: 'session', message: 'الجلسة المحفوظة ليست مسجّلة الدخول فعلاً: صفحة /me/ لم تتعرّف على حساب (Pinterest يُبقي كوكي الجلسة في وضع الزائر). إن كان خادمك يظهر CAPTCHA عند الدخول، استورد الكوكيز من متصفحك العادي عبر حقل «استيراد الكوكيز» في البطاقة، ثم أعد تحميل اللوحات.' });
    }
    return res.json({ ok: true, username: listed.username, boards: [], message: `الحساب ${listed.username} لا يملك أي لوحات بعد — أنشئ لوحة على Pinterest ثم أعد التحميل.` });
  }
  res.json({ ok: true, username: listed.username || me || '', boards: listed.boards });
}));

router.get('/sessions/:platform/verification', asyncRoute(async (req, res) => {
  res.json({ ok: true, ...scraper.sessions.verificationState(req.params.platform) });
}));

router.post('/sessions/:platform/verification', asyncRoute(async (req, res) => {
  const status = await scraper.sessions.submitVerification(req.params.platform, req.body && req.body.code);
  res.json({ ok: true, ...status });
}));

router.delete('/sessions/:platform/verification', asyncRoute(async (req, res) => {
  res.json(await scraper.sessions.cancelVerification(req.params.platform));
}));

router.delete('/sessions/:platform', asyncRoute(async (req, res) => {
  res.json(await scraper.sessions.logout(req.params.platform));
}));

// ---------------------------------------------------------------------------
// FeedSpy AI report + scheduler status
// ---------------------------------------------------------------------------

router.post('/feedspy/report', asyncRoute(async (req, res) => {
  res.json(await article.feedspyReport(req.body || {}));
}));

router.get('/scheduler', (req, res) => {
  res.json({ ok: true, ...scheduler.status() });
});

module.exports = router;
