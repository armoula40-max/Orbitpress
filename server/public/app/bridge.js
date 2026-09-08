'use strict';
/*
 * bridge.js — web replacement for the Android `window.Native` bridge.
 *
 * The OrbitPress UI was written for a WebView with a synchronous Java bridge.
 * The server edition keeps the UI byte-identical and reproduces that contract:
 *
 *   Synchronous reads  -> served from window.__BOOT__ (injected by the server)
 *   Synchronous writes -> optimistic local cache + async durable PUT
 *   bridge.call(type)  -> POST /api/bridge/call, result delivered through the
 *                         same window.__nativeResult(id, raw) callback the app used
 *   Scanners           -> built-in server scraper jobs (no API, no cookies upload)
 *
 * Settings lock verify/save use a same-origin synchronous XHR so the UI logic
 * (`if (!bridge.verifySettingsLock(pin))`) keeps working unchanged.
 */
(function () {
  var boot = window.__BOOT__ || {};
  var settingsCache = boot.settings || {};
  var workspaceCache = boot.workspace || {};
  var lockState = boot.settingsLock || { enabled: false };

  function activeSiteFromDom() {
    try { return (window.state && window.state.workspace && window.state.workspace.activeSiteId) || 'site-default'; } catch (e) { return 'site-default'; }
  }

  function syncJsonRequest(method, url, payload) {
    var xhr = new XMLHttpRequest();
    xhr.open(method, url, false); // same-origin sync call — matches Android bridge semantics
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.send(payload == null ? null : JSON.stringify(payload));
    if (xhr.status >= 200 && xhr.status < 300) {
      return JSON.parse(xhr.responseText || '{}');
    }
    var message = 'Request failed (' + xhr.status + ')';
    try { message = JSON.parse(xhr.responseText).message || message; } catch (e) { /* keep default */ }
    throw new Error(message);
  }

  // Serialized write chain: the Android bridge saved settings *synchronously*
  // before the next call() — replicate that ordering over HTTP.
  var writeQueue = Promise.resolve();
  function enqueueWrite(job) {
    writeQueue = writeQueue.then(job).catch(function () {});
    return writeQueue;
  }

  function blankSummary() {
    return {
      articleBaseUrl: '', articleModel: '', wordpressBaseUrl: '', wordpressUsername: '', categoryId: '',
      articleApiConfigured: false, wordpressConfigured: false, imageConfigured: false,
      pinterestConfigured: false, facebookConfigured: false, imageProvider: 'cloudflare',
      imageBaseUrl: '', imageAccountId: '', imageModel: '', pinterestBoardId: '', facebookGraphVersion: 'v23.0',
      textPrompt: '', imagePrompt: '', pinterestPrompt: '', articleImageCount: 0, scraperApiBaseUrl: '', scraperApiConfigured: false,
    };
  }

  var SAVE_DEBOUNCE_MS = 350;
  var workspaceTimer = null;
  var pendingWorkspace = null;

  function flushWorkspace() {
    if (pendingWorkspace == null) return;
    var payload = pendingWorkspace;
    pendingWorkspace = null;
    fetch('/api/workspace', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace: payload }),
      keepalive: true,
    }).catch(function () {
      noticeBridge('Workspace save failed — your latest change may not survive a reload.');
    });
  }

  function noticeBridge(message) {
    if (typeof window.notice === 'function') window.notice(message, 'bad');
  }

  window.addEventListener('beforeunload', function () {
    if (pendingWorkspace != null) {
      try {
        navigator.sendBeacon('/api/workspace', new Blob([JSON.stringify({ workspace: pendingWorkspace })], { type: 'application/json' }));
        pendingWorkspace = null;
      } catch (e) { /* best effort */ }
    }
  });

  function pollScanJob(jobId, deliver) {
    var attempts = 0;
    var timer = setInterval(function () {
      attempts += 1;
      fetch('/api/scraper/jobs/' + encodeURIComponent(jobId))
        .then(function (r) { return r.json(); })
        .then(function (job) {
          if (job.status === 'running' && attempts < 150) return;
          clearInterval(timer);
          if (job.status === 'done' && job.result) {
            job.result.jobId = jobId;
            deliver(JSON.stringify(job.result));
          } else {
            deliver(JSON.stringify({ ok: false, message: (job.error && job.error.message) || job.message || 'Scan failed.' }));
          }
        })
        .catch(function (error) {
          clearInterval(timer);
          deliver(JSON.stringify({ ok: false, message: error.message || 'Scan request failed.' }));
        });
    }, 2000);
  }

  function startScan(defaultPlatform, requestJson) {
    var request;
    try { request = JSON.parse(requestJson || '{}'); } catch (e) { request = {}; }
    // openSocialScanner carries the real platform (facebook|reddit)
    var platform = ['facebook', 'reddit', 'pinterest'].indexOf(String(request.platform || '')) !== -1 ? request.platform : defaultPlatform;
    var deliver = platform === 'pinterest'
      ? function (raw) { if (typeof window.__pinterestScanResult === 'function') window.__pinterestScanResult(raw); }
      : function (raw) { if (typeof window.__socialScanResult === 'function') window.__socialScanResult(raw); };
    var payload = {
      platform: platform,
      url: request.url || '',
      query: request.query || '',
      maxPosts: request.maxPosts || 25,
      maxPins: request.maxPins || 20,
      scrolls: request.scrolls || 6,
      useSession: true,
      siteId: request.siteId || 'site-default',
    };
    fetch('/api/scraper/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(function (r) { return r.json(); })
      .then(function (started) {
        if (!started.ok || !started.jobId) throw new Error(started.message || 'The scanner could not start.');
        pollScanJob(started.jobId, deliver);
      })
      .catch(function (error) {
        deliver(JSON.stringify({ ok: false, platform: platform, message: error.message || 'The scanner could not start.' }));
      });
  }

  window.Native = {
    // --- synchronous cached reads -------------------------------------------
    loadSettings: function (siteId) {
      var id = String(siteId || 'site-default');
      var summary = settingsCache[id] || blankSummary();
      return JSON.stringify(summary);
    },
    saveSettings: function (json, siteId) {
      var incoming;
      try { incoming = JSON.parse(json || '{}'); } catch (e) { throw new Error('Settings payload is invalid.'); }
      var id = String(siteId || 'site-default');
      enqueueWrite(function () {
        return fetch('/api/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ siteId: id, settings: incoming }),
          keepalive: true,
        })
          .then(function (r) { return r.json(); })
          .then(function (saved) { if (saved && saved.summary) settingsCache[id] = saved.summary; })
          .catch(function () { noticeBridge('Settings save failed — retry after checking the server.'); });
      });
      // optimistic summary flags so the UI reflects the save immediately
      var summary = settingsCache[id] || {};
      ['articleApiConfigured:articleApiKey', 'wordpressConfigured:wordpressAppPassword', 'imageConfigured:imageApiToken', 'facebookConfigured:facebookAccessToken', 'scraperApiConfigured:scraperApiKey'].forEach(function (pair) {
        var flag = pair.split(':')[0]; var secret = pair.split(':')[1];
        if (incoming[secret]) summary[flag] = true;
      });
      ['articleBaseUrl', 'articleModel', 'wordpressBaseUrl', 'wordpressUsername', 'categoryId', 'imageProvider', 'imageBaseUrl', 'imageAccountId', 'imageModel', 'pinterestBoardId', 'facebookGraphVersion', 'textPrompt', 'imagePrompt', 'pinterestPrompt', 'articleImageCount', 'scraperApiBaseUrl'].forEach(function (key) {
        if (incoming[key] !== undefined) summary[key] = incoming[key];
      });
      if (incoming.pinterestAccessToken) summary.pinterestConfigured = !!(incoming.pinterestBoardId || summary.pinterestBoardId);
      settingsCache[id] = summary;
    },
    loadWorkspace: function () {
      return JSON.stringify(workspaceCache || {});
    },
    saveWorkspace: function (json) {
      if (String(json).length > 1500000) throw new Error('The local workspace is too large. Remove older drafts before adding more.');
      try { workspaceCache = JSON.parse(json); } catch (e) { throw new Error('Workspace payload is invalid.'); }
      pendingWorkspace = workspaceCache;
      clearTimeout(workspaceTimer);
      workspaceTimer = setTimeout(flushWorkspace, SAVE_DEBOUNCE_MS);
    },
    loadSettingsLock: function () {
      return JSON.stringify({ enabled: !!lockState.enabled });
    },
    saveSettingsLock: function (pin) {
      var result = syncJsonRequest('POST', '/api/lock', { pin: pin });
      lockState.enabled = !!result.enabled;
    },
    verifySettingsLock: function (pin) {
      try {
        return !!syncJsonRequest('POST', '/api/lock/verify', { pin: pin }).ok;
      } catch (e) {
        return false;
      }
    },
    // --- async operations ----------------------------------------------------
    call: function (requestJson) {
      var request;
      try { request = JSON.parse(requestJson || '{}'); } catch (e) { return; }
      var id = request.id || ('request-' + Date.now());
      // chain after any pending settings/workspace writes so the server side
      // always sees the freshest configuration (mirrors the sync Android bridge)
      writeQueue.then(function () {
        return fetch('/api/bridge/call', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request),
        });
      })
        .then(function (r) { return r.json().catch(function () { return { ok: false, message: 'Server returned an unreadable response.' }; }); })
        .then(function (result) {
          if (typeof window.__nativeResult === 'function') window.__nativeResult(id, JSON.stringify(result));
        })
        .catch(function (error) {
          if (typeof window.__nativeResult === 'function') window.__nativeResult(id, JSON.stringify({ ok: false, message: error.message || 'Request failed.' }));
        });
    },
    // --- scanners: built-in server scraper ------------------------------------
    openSocialScanner: function (requestJson) { startScan('facebook', requestJson); },
    openPinterestScanner: function (requestJson) { startScan('pinterest', requestJson); },
    // --- legacy WorkManager boundary (server drives plans from the workspace) --
    schedule: function (operation, siteId, delayMinutes) {
      return 'server-plan-' + Date.now();
    },
  };
})();
