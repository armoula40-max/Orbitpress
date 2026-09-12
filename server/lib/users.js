'use strict';
/**
 * users.js — access-code based tenant registry.
 *
 * There is no public sign-up: the admin (master ORBITPRESS_TOKEN) adds a
 * user and receives a one-time access code to hand over. The user enters
 * that code to sign in; the admin can block it, reset it, or open the
 * user's workspace for content oversight.
 *
 * Registry file (owner level only):
 *   data/users.json -> { users: [{ id, name, note, codeHash, codeTail,
 *                                  status, createdAt, createdBy,
 *                                  lastSeenAt, seenCount }] }
 * Codes are stored as HMAC-SHA256 (keyed by the server's existing
 * .secret-key), never in clear text; only the first two characters are
 * kept as a hint for the admin table.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { ROOT_DATA_DIR, OWNER_ID, dataDirFor } = require('./reqContext');

const USERS_FILE = path.join(ROOT_DATA_DIR, 'users.json');
const AUDIT_FILE = path.join(ROOT_DATA_DIR, 'audit.logl');
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no ambiguous I/L/O/0/1
const VALID_STATUSES = new Set(['active', 'blocked']);

fs.mkdirSync(ROOT_DATA_DIR, { recursive: true });

function serverKey() {
  const keyPath = path.join(ROOT_DATA_DIR, '.secret-key');
  if (fs.existsSync(keyPath)) return Buffer.from(fs.readFileSync(keyPath, 'utf8').trim(), 'hex');
  const key = crypto.randomBytes(32);
  fs.writeFileSync(keyPath, key.toString('hex'), { mode: 0o600 });
  return key;
}

function codeHash(code) {
  return crypto.createHmac('sha256', serverKey()).update(String(code).trim().toUpperCase()).digest('hex');
}

function generateCode() {
  const bytes = crypto.randomBytes(9);
  const chars = [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
  return `${chars.slice(0, 4)}-${chars.slice(4)}`; // e.g. AB3K-M7P2Q
}

function normalizeCode(raw) {
  return String(raw || '').trim().toUpperCase().replace(/\s+/g, '');
}

function loadRegistry() {
  try {
    const parsed = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    if (parsed && Array.isArray(parsed.users)) return parsed;
  } catch { /* first run or corrupt file */ }
  return { users: [] };
}

function saveRegistry(registry) {
  const tmp = USERS_FILE + '.tmp-' + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(registry, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, USERS_FILE);
}

function publicView(user) {
  return {
    id: user.id,
    name: user.name || '',
    note: user.note || '',
    status: user.status || 'active',
    codeTail: user.codeTail || '',
    createdAt: user.createdAt || null,
    createdBy: user.createdBy || 'owner',
    lastSeenAt: user.lastSeenAt || null,
    seenCount: user.seenCount || 0,
  };
}

function listUsers() {
  return loadRegistry().users.map(publicView);
}

function findByCode(rawCode) {
  const code = normalizeCode(rawCode);
  if (code.length < 6) return null;
  const hash = codeHash(code);
  const user = loadRegistry().users.find((u) => u.codeHash === hash);
  return user || null;
}

/**
 * Authenticate a presented token that is NOT the master token.
 * Returns { ok, user?, status? } — blocked codes stay recognizable so the
 * login page can explain the refusal.
 */
function authenticateCode(rawCode) {
  const user = findByCode(rawCode);
  if (!user) return { ok: false, status: 'unknown' };
  if (user.status === 'blocked') return { ok: false, status: 'blocked', user: publicView(user) };
  return { ok: true, status: 'active', user: publicView(user) };
}

function touchUser(id) {
  const registry = loadRegistry();
  const user = registry.users.find((u) => u.id === id);
  if (!user) return;
  const now = Date.now();
  const last = user.lastSeenAt ? Date.parse(user.lastSeenAt) : 0;
  if (last && now - last < 60_000) return; // at most one refresh per minute
  user.lastSeenAt = new Date(now).toISOString();
  user.seenCount = (user.seenCount || 0) + 1;
  saveRegistry(registry);
}

function createUser({ name = '', note = '' } = {}, createdBy = 'owner') {
  const registry = loadRegistry();
  const code = generateCode();
  const now = new Date().toISOString();
  const user = {
    id: `u_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`,
    name: String(name || '').trim().slice(0, 80),
    note: String(note || '').trim().slice(0, 240),
    codeHash: codeHash(code),
    codeTail: code.slice(0, 2),
    status: 'active',
    createdAt: now,
    createdBy,
    lastSeenAt: null,
    seenCount: 0,
  };
  registry.users.push(user);
  saveRegistry(registry);
  audit('user.created', { id: user.id, name: user.name, by: createdBy });
  fs.mkdirSync(dataDirFor(user.id), { recursive: true });
  return { user: publicView(user), code };
}

function requireUser(id) {
  const user = loadRegistry().users.find((u) => u.id === id);
  if (!user) throw Object.assign(new Error('المستخدم غير موجود.'), { statusCode: 404 });
  return user;
}

function setStatus(id, status) {
  if (!VALID_STATUSES.has(status)) throw new Error('حالة غير صالحة.');
  const registry = loadRegistry();
  const user = registry.users.find((u) => u.id === id);
  if (!user) throw Object.assign(new Error('المستخدم غير موجود.'), { statusCode: 404 });
  user.status = status;
  saveRegistry(registry);
  audit(`user.${status === 'blocked' ? 'blocked' : 'activated'}`, { id, name: user.name });
  return publicView(user);
}

function resetCode(id) {
  const registry = loadRegistry();
  const user = registry.users.find((u) => u.id === id);
  if (!user) throw Object.assign(new Error('المستخدم غير موجود.'), { statusCode: 404 });
  const code = generateCode();
  user.codeHash = codeHash(code);
  user.codeTail = code.slice(0, 2);
  user.status = 'active';
  user.lastSeenAt = null;
  user.seenCount = 0;
  saveRegistry(registry);
  audit('user.code_reset', { id, name: user.name });
  return { user: publicView(user), code };
}

function directorySize(dir) {
  let total = 0;
  let files = 0;
  if (!fs.existsSync(dir)) return { bytes: 0, files: 0 };
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else {
        try { total += fs.statSync(full).size; files += 1; } catch { /* race */ }
      }
    }
  };
  walk(dir);
  return { bytes: total, files };
}

function overview() {
  const users = listUsers();
  const withUsage = users.map((u) => ({ ...u, storage: directorySize(dataDirFor(u.id)) }));
  const totals = {
    users: users.length,
    active: users.filter((u) => u.status === 'active').length,
    blocked: users.filter((u) => u.status === 'blocked').length,
    bytes: withUsage.reduce((sum, u) => sum + u.storage.bytes, 0),
  };
  return { totals, users: withUsage };
}

function audit(action, details = {}) {
  const line = JSON.stringify({ at: new Date().toISOString(), action, ...details }) + '\n';
  try { fs.appendFileSync(AUDIT_FILE, line, { mode: 0o600 }); } catch { /* best effort */ }
}

function readAudit(limit = 200) {
  if (!fs.existsSync(AUDIT_FILE)) return [];
  const lines = fs.readFileSync(AUDIT_FILE, 'utf8').trim().split('\n').filter(Boolean);
  return lines.slice(-limit).map((line) => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean).reverse();
}

module.exports = {
  OWNER_ID,
  createUser,
  listUsers,
  setStatus,
  resetCode,
  authenticateCode,
  touchUser,
  overview,
  audit,
  readAudit,
  dataDirFor,
};
