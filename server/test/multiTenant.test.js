'use strict';
/*
 * Multi-tenant end-to-end tests against the REAL server:
 *   - owner (master token) issues one-time access codes from the admin API
 *   - code holders log in through /api/auth and get an isolated data dir
 *   - workspaces/images/settings never leak across tenants or to the owner
 *   - the owner can open a tenant's full workspace for legal oversight
 *   - blocking denies immediately, resetting a code voids the old one
 *   - admin endpoints are 403 for ordinary users; every event is audited
 */
process.env.ORBITPRESS_ALLOW_HTTP = '1';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const OWNER_TOKEN = 'owner-token-' + Date.now();
const PORT = 18_442; // unlikely to clash

async function bootServer(t) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbitpress-tenant-'));
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'index.js')], {
    env: {
      ...process.env,
      PORT: String(PORT),
      HOST: '127.0.0.1',
      ORBITPRESS_TOKEN: OWNER_TOKEN,
      ORBITPRESS_DATA_DIR: dataDir,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(() => child.kill('SIGTERM'));
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server did not start')), 20_000);
    child.stdout.on('data', (chunk) => {
      if (String(chunk).includes('listening')) { clearTimeout(timer); resolve(); }
    });
    child.stderr.on('data', (chunk) => process.stderr.write(chunk));
  });
  return { base: `http://127.0.0.1:${PORT}`, dataDir };
}

async function json(url, options = {}) {
  const res = await fetch(url, options);
  const body = await res.text();
  let parsed = {};
  try { parsed = body ? JSON.parse(body) : {}; } catch { /* may be HTML */ }
  return { res, body, json: parsed };
}

const cookieOf = (res) => {
  const setCookie = res.headers.get('set-cookie');
  return setCookie ? setCookie.split(';')[0] : '';
};

test('multi-tenant: issued codes, data isolation, oversight, blocking and reset', async (t) => {
  const { base, dataDir } = await bootServer(t);
  const ownerAuth = `?token=${OWNER_TOKEN}`;

  // 1) Owner creates a user and receives a one-time code
  let { res, json: created } = await json(base + '/api/admin/users' + ownerAuth, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'محمود', note: 'موقع وصفات' }),
  });
  assert.equal(res.status, 200);
  assert.ok(created.ok);
  assert.match(created.code, /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{5}$/);
  const userId = created.user.id;
  assert.equal(created.user.status, 'active');
  // The registry never stores the plaintext code (only an HMAC + 2-char tail)
  const registry = JSON.parse(fs.readFileSync(path.join(dataDir, 'users.json'), 'utf8'));
  assert.ok(registry.users[0].codeHash);
  assert.equal(registry.users[0].codeTail, created.code.slice(0, 2));
  assert.ok(!JSON.stringify(registry).includes(created.code));

  // 2) A name is mandatory
  ({ res } = await json(base + '/api/admin/users' + ownerAuth, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '  ' }),
  }));
  assert.equal(res.status, 400); // validation errors pass through as bad requests

  // 3) The code logs in through /api/auth and yields a cookie session
  let login = await json(base + '/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: created.code }),
  });
  assert.equal(login.res.status, 200);
  assert.equal(login.json.role, 'user');
  const userCookie = cookieOf(login.res);
  assert.ok(userCookie.includes('orbitpress_token='));

  // 4) Invalid codes are rejected and audited
  const bad = await json(base + '/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: 'ZZZZ-99999' }),
  });
  assert.equal(bad.res.status, 401);

  // 5) Identity endpoint reports the scoped role
  let me = await json(base + '/api/me', { headers: { Cookie: userCookie } });
  assert.equal(me.json.role, 'user');
  assert.equal(me.json.userId, userId);

  // 6) Tenant saves private content
  const secretDraft = {
    drafts: [{ id: 'd1', title: 'وصفة الكسكس الحصرية', status: 'مسودة', html: '<p>سرّي</p>' }],
    reviewQueue: [],
  };
  let saved = await json(base + '/api/workspace', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: userCookie },
    body: JSON.stringify({ workspace: secretDraft }),
  });
  assert.equal(saved.res.status, 200);

  // 7) The tenant sees their own draft
  let boot = await json(base + '/api/bootstrap', { headers: { Cookie: userCookie } });
  assert.equal(boot.json.workspace.drafts[0].title, 'وصفة الكسكس الحصرية');
  assert.equal(boot.json.auth.role, 'user');

  // ... and it lives under data/users/<id>/, not the owner root
  const tenantFile = path.join(dataDir, 'users', userId, 'workspace.json');
  assert.ok(fs.existsSync(tenantFile), 'tenant workspace must be isolated on disk');
  assert.ok(!fs.existsSync(path.join(dataDir, 'workspace.json')), 'owner root must not carry tenant data');

  // 8) The owner's own workspace is empty — no leakage
  const ownerDeepLink = await fetch(base + '/' + ownerAuth);
  const ownerCook = cookieOf(ownerDeepLink);
  let ownerBoot = await json(base + '/api/bootstrap', { headers: { Cookie: ownerCook } });
  assert.deepEqual(ownerBoot.json.workspace, {});
  assert.equal(ownerBoot.json.auth.role, 'owner');

  // 9) A tenant cannot reach any admin endpoint
  for (const url of ['/api/admin/users', '/api/admin/overview', '/api/admin/audit', `/api/admin/users/${userId}/workspace`]) {
    const probe = await json(base + url, { headers: { Cookie: userCookie } });
    assert.equal(probe.res.status, 403, `${url} must be owner-only`);
  }
  // ... and cannot create users either
  const probeCreate = await json(base + '/api/admin/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: userCookie },
    body: JSON.stringify({ name: 'هاكر' }),
  });
  assert.equal(probeCreate.res.status, 403);

  // 10) Owner oversight sees the FULL tenant content
  const oversight = await json(base + `/api/admin/users/${userId}/workspace`, {
    headers: { Cookie: ownerCook },
  });
  assert.equal(oversight.res.status, 200);
  assert.equal(oversight.json.workspace.drafts[0].title, 'وصفة الكسكس الحصرية');
  assert.ok(oversight.json.settings, 'oversight includes the settings-configured summary');
  assert.ok(!JSON.stringify(oversight.json).includes('appPassword'), 'secrets must never be exposed');

  // Unknown tenant -> 404
  const missing = await json(base + '/api/admin/users/u_nope/workspace', { headers: { Cookie: ownerCook } });
  assert.equal(missing.res.status, 404);

  // 11) Audit trail covers creation, bad codes and oversight reads
  const audit = await json(base + '/api/admin/audit?limit=200', { headers: { Cookie: ownerCook } });
  const actions = audit.json.entries.map((e) => e.action);
  assert.ok(actions.includes('user.created'));
  assert.ok(actions.includes('auth.invalid_code'));
  assert.ok(actions.includes('admin.workspace_viewed'));

  // 12) Blocking cuts access immediately (existing cookie included)
  const blocked = await json(base + `/api/admin/users/${userId}/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: ownerCook },
    body: JSON.stringify({ status: 'blocked' }),
  });
  assert.equal(blocked.json.user.status, 'blocked');
  const afterBlock = await json(base + '/api/bootstrap', { headers: { Cookie: userCookie } });
  assert.equal(afterBlock.res.status, 403);
  const blockedLogin = await json(base + '/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: created.code }),
  });
  assert.equal(blockedLogin.res.status, 403);

  // 13) Reset voids the old code, reactivates the user, and issues a new one
  const reset = await json(base + `/api/admin/users/${userId}/reset-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: ownerCook },
    body: '{}',
  });
  assert.equal(reset.res.status, 200);
  assert.notEqual(reset.json.code, created.code);
  assert.equal(reset.json.user.status, 'active');
  const oldCodeNow = await json(base + '/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: created.code }),
  });
  assert.equal(oldCodeNow.res.status, 401);
  const newLogin = await json(base + '/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: reset.json.code }),
  });
  assert.equal(newLogin.res.status, 200);
  assert.equal(newLogin.json.role, 'user');

  // 14) Served UI carries the role: the user gets role:"user", owner "owner"
  const userPage = await fetch(base + '/', { headers: { Cookie: cookieOf(newLogin.res) } });
  const userHtml = await userPage.text();
  assert.ok(userHtml.includes('"role":"user"'));
  const ownerPage = await fetch(base + '/', { headers: { Cookie: ownerCook } });
  assert.ok((await ownerPage.text()).includes('"role":"owner"'));
});
