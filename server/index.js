'use strict';
/**
 * OrbitPress Server Edition — entry point.
 *
 * Serves the OrbitPress web interface (the same UI as the Android app) and the
 * HTTP API that replaces the Android Native bridge, including the built-in
 * social scraper (no external API, no cookie uploads) and server-side sessions.
 */
const fs = require('fs');
const path = require('path');
const express = require('express');
const routes = require('./lib/routes');
const scheduler = require('./lib/scheduler');
const scraper = require('./lib/scraper');
const store = require('./lib/store');

const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, 'public');
const INDEX_FILE = path.join(PUBLIC_DIR, 'index.html');
const ACCESS_TOKEN = (process.env.ORBITPRESS_TOKEN || '').trim();

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '30mb' }));

// --- optional access gate (recommended on a public VPS) --------------------
function authorized(req) {
  if (!ACCESS_TOKEN) return true;
  const header = String(req.headers['x-orbitpress-token'] || '');
  const cookie = (req.headers.cookie || '').split(';').map((part) => part.trim()).find((part) => part.startsWith('orbitpress_token='));
  const cookieValue = cookie ? decodeURIComponent(cookie.split('=')[1] || '') : '';
  const query = String(req.query.token || '');
  return header === ACCESS_TOKEN || cookieValue === ACCESS_TOKEN || query === ACCESS_TOKEN;
}

function tokenCookieValue() {
  return `orbitpress_token=${encodeURIComponent(ACCESS_TOKEN)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`;
}

app.post('/api/auth', express.json(), (req, res) => {
  if (!ACCESS_TOKEN) return res.json({ ok: true, unlocked: true });
  if (String((req.body && req.body.token) || '') === ACCESS_TOKEN) {
    res.setHeader('Set-Cookie', tokenCookieValue());
    return res.json({ ok: true, unlocked: true });
  }
  return res.status(401).json({ ok: false, message: 'رمز الدخول غير صحيح.' });
});

app.use((req, res, next) => {
  // Upgrade a ?token= deep-link into a persistent cookie session, otherwise the
  // very next static-asset request (bridge.js…) would hit the gate anonymously.
  if (ACCESS_TOKEN && String(req.query.token || '') === ACCESS_TOKEN) {
    res.setHeader('Set-Cookie', tokenCookieValue());
  }
  // /ping stays public intentionally: Docker healthcheck + uptime monitors.
  if (!ACCESS_TOKEN || authorized(req) || req.path === '/api/auth' || req.path === '/ping') return next();
  if (req.method === 'GET' && (req.path === '/' || req.path === '/index.html')) {
    res.status(200).send(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>OrbitPress — دخول</title><style>body{font-family:system-ui;background:#0b1220;color:#f2f6ff;display:grid;place-items:center;min-height:100vh;margin:0}form{background:#0f1a2d;padding:32px;border-radius:18px;border:1px solid #263b5d;width:min(360px,90vw)}input{width:100%;padding:12px;margin:10px 0;border-radius:10px;border:1px solid #385783;background:#13233d;color:#fff}button{width:100%;padding:12px;border:0;border-radius:10px;background:#4169ff;color:#fff;font-weight:800;cursor:pointer}</style></head><body><form onsubmit="event.preventDefault();fetch('/api/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:this.token.value})}).then(r=>r.json()).then(r=>r.ok?location.reload():alert(r.message||'خطأ')).catch(()=>alert('خطأ في الاتصال'))"><h2 style="margin-top:0">OrbitPress Server</h2><p style="color:#aab8ce;font-size:13px">هذه النسخة محمية برمز دخول (ORBITPRESS_TOKEN).</p><input name="token" type="password" placeholder="رمز الدخول" required><button type="submit">دخول</button></form></body></html>`);
    return;
  }
  res.status(401).json({ ok: false, message: 'Unauthorized. Provide the OrbitPress access token.' });
});

// --- API -------------------------------------------------------------------
app.use('/api', routes);

// --- UI: inject the bootstrap payload, then serve static assets ------------
function renderIndex() {
  const raw = fs.readFileSync(INDEX_FILE, 'utf8');
  const boot = {
    workspace: store.loadWorkspace(),
    settingsLock: store.loadSettingsLock(),
    settings: store.allSettingsSummaries(),
    sessions: scraper.sessions.statuses(),
    scheduler: scheduler.status(),
    server: { edition: 'server', version: '4.0.0' },
  };
  const injection = `<script>window.__BOOT__=${JSON.stringify(boot).replace(/</g, '\\u003c')};</script>\n  <script src="/app/bridge.js"></script>`;
  return raw.replace('<body>', `<body>\n  ${injection}`);
}

app.get(['/', '/index.html'], (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.send(renderIndex());
});

app.get('/ping', (req, res) => res.json({ ok: true, service: 'orbitpress-server' }));

app.use(express.static(PUBLIC_DIR, { index: false, maxAge: '5m' }));

// --- lifecycle ---------------------------------------------------------------
const server = app.listen(PORT, HOST, () => {
  console.log(`[orbitpress] server edition listening on http://${HOST}:${PORT}`);
  scheduler.start();
});

function shutdown() {
  console.log('[orbitpress] shutting down…');
  server.close(() => {});
  scraper.sessions.closeAllContexts().finally(() => process.exit(0));
  setTimeout(() => process.exit(0), 4000).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
