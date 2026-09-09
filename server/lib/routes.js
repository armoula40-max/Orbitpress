'use strict';
/**
 * routes.js — HTTP API that replaces the Android Native bridge.
 */
const express = require('express');
const store = require('./store');
const wordpress = require('./wordpress');
const images = require('./images');
const article = require('./article');
const socialapi = require('./socialapi');
const scraper = require('./scraper');
const scheduler = require('./scheduler');

const router = express.Router();

function asyncRoute(handler) {
  return (req, res) => {
    Promise.resolve()
      .then(() => handler(req, res))
      .catch((error) => {
        const status = error && error.status === 401 ? 401 : 200; // bridge protocol returns ok:false payloads
        res.status(status).json({ ok: false, message: error && error.message ? error.message : 'An unexpected error occurred.' });
      });
  };
}

// ---------------------------------------------------------------------------
// Bootstrap / workspace / settings / lock (sync bridge replacements)
// ---------------------------------------------------------------------------

router.get('/bootstrap', (req, res) => {
  res.json({
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
  storeImage: (req) => images.storeImage(req),
  loadImage: (req) => images.loadImage(req),
  removeImage: (req) => images.removeImage(req),
  repairPreview: (req) => wordpress.repairPreview(req),
  repairApply: (req) => wordpress.repairApply(req),
  generateImage: (req) => wordpress.generateImage(req),
  publishPinterest: (req) => wordpress.publishPinterest(req),
  publish: (req) => wordpress.publish(req),
};

router.post('/bridge/call', asyncRoute(async (req, res) => {
  const request = req.body || {};
  const operation = BRIDGE_OPERATIONS[String(request.type || '')];
  if (!operation) throw new Error('Unknown operation.');
  const result = await operation(request);
  res.json(result && typeof result === 'object' ? { ok: true, ...result } : { ok: true, result });
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
