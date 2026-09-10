'use strict';
/*
 * Boots the REAL index.js (with ORBITPRESS_TOKEN set) as a child process and
 * verifies the access gate end-to-end: public ping, login challenge, token
 * deep-link cookie upgrade, and cookie-protected static/API assets.
 */
process.env.ORBITPRESS_ALLOW_HTTP = '1';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const TOKEN = 'test-token-' + Date.now();
const PORT = 18_441; // unlikely to clash

async function bootServer(t) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbitpress-gate-'));
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'index.js')], {
    env: {
      ...process.env,
      PORT: String(PORT),
      HOST: '127.0.0.1',
      ORBITPRESS_TOKEN: TOKEN,
      ORBITPRESS_DATA_DIR: dataDir,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(() => child.kill('SIGTERM'));
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server did not start')), 20000);
    child.stdout.on('data', (chunk) => {
      if (String(chunk).includes('listening')) { clearTimeout(timer); resolve(); }
    });
    child.stderr.on('data', (chunk) => process.stderr.write(chunk));
  });
  return `http://127.0.0.1:${PORT}`;
}

test('access gate: ping public, UI+assets+API require the token, ?token= upgrades', async (t) => {
  const base = await bootServer(t);

  // 1) ping is public (Docker healthcheck)
  let res = await fetch(base + '/ping');
  assert.equal(res.status, 200);
  assert.equal((await res.json()).ok, true);

  // 2) / without token -> login page (not the app)
  res = await fetch(base + '/');
  const gate = await res.text();
  assert.ok(gate.includes('ORBITPRESS_TOKEN') || gate.includes('رمز الدخول'));
  assert.ok(!gate.includes('window.__BOOT__'));

  // 3) API without token -> 401
  res = await fetch(base + '/api/bootstrap');
  assert.equal(res.status, 401);

  // 4) wrong token -> still the gate, no cookie upgrade
  res = await fetch(base + '/?token=wrong-token');
  assert.equal(res.headers.get('set-cookie'), null);

  // 5) correct ?token= deep-link -> app served AND cookie set (bridge assets survive later)
  res = await fetch(base + `/?token=${TOKEN}`);
  const html = await res.text();
  assert.ok(html.includes('window.__BOOT__'));
  const setCookie = res.headers.get('set-cookie');
  assert.ok(setCookie && setCookie.includes('orbitpress_token='), 'token deep-link must upgrade to a session cookie');

  // 6) with the cookie: static assets + API open up
  const cookie = setCookie.split(';')[0];
  res = await fetch(base + '/app/bridge.js', { headers: { Cookie: cookie } });
  assert.equal(res.status, 200);
  assert.ok((await res.text()).includes('window.Native'));
  res = await fetch(base + '/app/feedspy.js', { headers: { Cookie: cookie } });
  assert.equal(res.status, 200);
  res = await fetch(base + '/api/bootstrap', { headers: { Cookie: cookie } });
  assert.equal(res.status, 200);

  // 7) and the assets are blocked without it
  res = await fetch(base + '/app/bridge.js');
  assert.equal(res.status, 401);
});
