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
const users = require('./lib/users');
const { runAs } = require('./lib/reqContext');

const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, 'public');
const INDEX_FILE = path.join(PUBLIC_DIR, 'index.html');
const ACCESS_TOKEN = (process.env.ORBITPRESS_TOKEN || '').trim();

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '30mb' }));

// --- access gate: master owner token OR admin-issued user access codes ----
function presentedToken(req) {
  const header = String(req.headers['x-orbitpress-token'] || '');
  const cookie = (req.headers.cookie || '').split(';').map((part) => part.trim()).find((part) => part.startsWith('orbitpress_token='));
  const cookieValue = cookie ? decodeURIComponent(cookie.split('=')[1] || '') : '';
  return String(header || cookieValue || (req.query && req.query.token) || (req.body && req.body.token) || '');
}

// Returns { ok, role, userId, reason } — classification only.
function classify(req) {
  if (!ACCESS_TOKEN) return { ok: true, role: 'owner', userId: 'owner' };
  const token = presentedToken(req);
  if (!token) return { ok: false, reason: 'anonymous' };
  if (token === ACCESS_TOKEN) return { ok: true, role: 'owner', userId: 'owner', token };
  const verdict = users.authenticateCode(token);
  if (!verdict.ok) return { ok: false, reason: verdict.status === 'blocked' ? 'blocked' : 'invalid', token };
  return { ok: true, role: 'user', userId: verdict.user.id, profile: verdict.user, token };
}

function tokenCookieValue(token) {
  const secure = process.env.ORBITPRESS_COOKIE_SECURE === '1' ? '; Secure' : '';
  return `orbitpress_token=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secure}`;
}

const LOGIN_PAGE = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>OrbitPress — دخول</title><style>body{font-family:system-ui;background:#0b1220;color:#f2f6ff;display:grid;place-items:center;min-height:100vh;margin:0;padding:20px}form{background:#0f1a2d;padding:32px;border-radius:18px;border:1px solid #263b5d;width:min(380px,94vw)}h2{margin-top:0}p{color:#aab8ce;font-size:13px;line-height:1.6}input{width:100%;padding:13px;margin:10px 0;border-radius:10px;border:1px solid #385783;background:#13233d;color:#fff;font-size:16px;letter-spacing:.08em}button{width:100%;padding:13px;border:0;border-radius:10px;background:#4169ff;color:#fff;font-weight:800;cursor:pointer;font-size:15px}#msg{display:none;margin-top:12px;padding:10px;border-radius:10px;background:#3a1d24;color:#ffc9c4;font-size:13px}</style></head><body><form id="f"><h2>OrbitPress</h2><p>أدخل رمز الدخول الذي سلّمك إياه المدير. إذا لم يكن لديك رمز، اطلب إنشاء حسابك من إدارة التطبيق.</p><input name="token" type="text" inputmode="latin" autocapitalize="characters" autocomplete="off" placeholder="XXXX-XXXXX" required><button type="submit">دخول</button><div id="msg"></div></form><script>document.getElementById('f').addEventListener('submit',async function(e){e.preventDefault();var msg=document.getElementById('msg');msg.style.display='none';try{var r=await fetch('/api/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:this.token.value})});var j=await r.json();if(j.ok){location.href='/';}else{msg.textContent=j.message||'رمز الدخول غير صحيح.';msg.style.display='block';}}catch(_){msg.textContent='تعذّر الاتصال بالخادم.';msg.style.display='block';}});</script></body></html>`;

app.post('/api/auth', express.json(), (req, res) => {
  if (!ACCESS_TOKEN) return res.json({ ok: true, unlocked: true, role: 'owner' });
  const token = String((req.body && req.body.token) || '').trim();
  const verdict = classify({ headers: req.headers, query: {}, body: { token } });
  if (verdict.ok) {
    res.setHeader('Set-Cookie', tokenCookieValue(verdict.role === 'owner' ? ACCESS_TOKEN : token));
    if (verdict.role === 'user') users.touchUser(verdict.userId);
    return res.json({ ok: true, unlocked: true, role: verdict.role, user: verdict.profile || null });
  }
  if (verdict.reason === 'blocked') {
    users.audit('auth.blocked_attempt', { tail: token.slice(0, 2) });
    return res.status(403).json({ ok: false, message: 'تم حظر رمز الدخول هذا من قبل المدير. تواصل مع الإدارة.' });
  }
  users.audit('auth.invalid_code', { tail: token.slice(0, 2) });
  return res.status(401).json({ ok: false, message: 'رمز الدخول غير صحيح.' });
});

app.use((req, res, next) => {
  // Public assets: health check and the open-source SEO bridge plugin files
  // (they contain no secrets; owners may wget them straight onto a server).
  if (req.path === '/ping' || req.path.startsWith('/downloads/')) return next();
  const verdict = classify(req);
  if (!verdict.ok) {
    if (verdict.reason === 'blocked') {
      users.audit('auth.blocked_attempt', { path: req.path });
      if (req.method === 'GET' && (req.path === '/' || req.path === '/index.html')) return res.status(403).send(LOGIN_PAGE);
      return res.status(403).json({ ok: false, message: 'تم حظر رمز الدخول هذا من قبل المدير.' });
    }
    if (req.method === 'GET' && (req.path === '/' || req.path === '/index.html')) return res.status(200).send(LOGIN_PAGE);
    return res.status(401).json({ ok: false, message: 'Unauthorized. Provide an OrbitPress access code.' });
  }
  if (String(req.query.token || '')) res.setHeader('Set-Cookie', tokenCookieValue(verdict.role === 'owner' ? ACCESS_TOKEN : verdict.token));
  if (verdict.role === 'user') users.touchUser(verdict.userId);
  req.auth = verdict;
  runAs(verdict.userId, next);
});

// --- API -------------------------------------------------------------------
app.use('/api', routes);

// --- UI: inject the bootstrap payload, then serve static assets ------------
function renderIndex(req) {
  const raw = fs.readFileSync(INDEX_FILE, 'utf8');
  const boot = {
    auth: {
      role: (req.auth && req.auth.role) || 'owner',
      user: (req.auth && req.auth.profile) || null,
    },
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
  res.send(renderIndex(req));
});

app.get('/ping', (req, res) => res.json({ ok: true, service: 'orbitpress-server' }));

// OrbitPress SEO Bridge plugin download (writes Yoast/Rank Math meta over REST)
app.get('/downloads/seo-bridge-plugin', (req, res) => {
  const file = path.join(__dirname, '..', 'wordpress', 'orbitpress-seo-bridge', 'orbitpress-seo-bridge.zip');
  res.download(file, 'orbitpress-seo-bridge.zip');
});
app.get('/downloads/seo-bridge-guide', (req, res) => {
  const file = path.join(__dirname, '..', 'wordpress', 'orbitpress-seo-bridge', 'README_AR.md');
  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.download(file, 'orbitpress-seo-bridge-guide.md');
});

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
