'use strict';
/**
 * store.js — server-side persistence that mirrors Android EncryptedSharedPreferences.
 *
 * - One JSON document per site inside data/settings.json, with secret fields
 *   encrypted (AES-256-GCM) using a key generated once in data/.secret-key.
 * - Workspace, settings lock (PBKDF2 hash) and scheduler state live alongside.
 * - All writes are atomic (tmp file + rename).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { SettingsPersistenceContract } = require('./contracts');

const DATA_DIR = process.env.ORBITPRESS_DATA_DIR || path.join(__dirname, '..', 'data');
const SECRET_FIELDS = ['articleApiKey', 'wordpressAppPassword', 'imageApiToken', 'pinterestAccessToken', 'facebookAccessToken', 'scraperApiKey'];
const SECRET_ENC_PREFIX = 'enc:v1:';
const PBKDF2_ITERATIONS = 120000;

fs.mkdirSync(DATA_DIR, { recursive: true });

function loadMasterKey() {
  const keyPath = path.join(DATA_DIR, '.secret-key');
  const envKey = process.env.ORBITPRESS_SECRET_KEY;
  if (envKey && /^[0-9a-f]{64}$/i.test(envKey.trim())) return Buffer.from(envKey.trim(), 'hex');
  if (fs.existsSync(keyPath)) return Buffer.from(fs.readFileSync(keyPath, 'utf8').trim(), 'hex');
  const key = crypto.randomBytes(32);
  fs.writeFileSync(keyPath, key.toString('hex'), { mode: 0o600 });
  return key;
}

const MASTER_KEY = loadMasterKey();

function encryptSecret(plain) {
  if (!plain) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', MASTER_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return SECRET_ENC_PREFIX + [iv, cipher.getAuthTag(), encrypted].map((b) => b.toString('base64')).join('.');
}

function decryptSecret(stored) {
  const value = String(stored || '');
  if (!value.startsWith(SECRET_ENC_PREFIX)) return value; // legacy plaintext import
  const [ivB64, tagB64, dataB64] = value.slice(SECRET_ENC_PREFIX.length).split('.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', MASTER_KEY, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
}

function readJson(filename, fallback) {
  const file = path.join(DATA_DIR, filename);
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(filename, value) {
  const file = path.join(DATA_DIR, filename);
  const tmp = file + '.tmp-' + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(value), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

// --------------------------------------------------------------------------
// Settings per site (secrets stay encrypted at rest)
// --------------------------------------------------------------------------

function readSettingsFile() {
  return readJson('settings.json', { sites: {} });
}

function rawSiteSettings(siteId) {
  const canonical = SettingsPersistenceContract.canonicalSiteId(siteId);
  const file = readSettingsFile();
  const scoped = file.sites[canonical];
  return scoped && typeof scoped === 'object' ? scoped : (file.legacy || {});
}

/** Full settings with secrets decrypted — for internal server use only. */
function getSiteSettings(siteId) {
  const raw = JSON.parse(JSON.stringify(readJsonSafe(rawSiteSettings(siteId))));
  SECRET_FIELDS.forEach((field) => {
    if (raw[field]) raw[field] = decryptSecret(raw[field]);
  });
  return raw;
}

function readJsonSafe(value) { return value && typeof value === 'object' ? value : {}; }

/** Merge + persist using the same merge contract as the Android app. Secrets are encrypted before writing. */
function saveSiteSettings(incoming, siteId) {
  const canonical = SettingsPersistenceContract.canonicalSiteId(siteId);
  const existingDecrypted = getSiteSettings(canonical);
  const merged = SettingsPersistenceContract.merge(existingDecrypted, incoming || {});
  SECRET_FIELDS.forEach((field) => {
    if (merged[field] && !String(merged[field]).startsWith(SECRET_ENC_PREFIX)) merged[field] = encryptSecret(merged[field]);
  });
  const file = readSettingsFile();
  file.sites[canonical] = merged;
  delete file.legacy;
  writeJson('settings.json', file);
  return merged;
}

/** Settings summary for the UI: never exposes secret values, only "configured" flags. */
function getSettingsSummary(siteId) {
  const saved = getSiteSettings(siteId);
  return {
    articleBaseUrl: saved.articleBaseUrl || '',
    articleModel: saved.articleModel || '',
    wordpressBaseUrl: saved.wordpressBaseUrl || '',
    wordpressUsername: saved.wordpressUsername || '',
    categoryId: saved.categoryId || '',
    articleApiConfigured: !!saved.articleApiKey,
    wordpressConfigured: !!saved.wordpressAppPassword,
    imageConfigured: !!saved.imageApiToken,
    pinterestConfigured: !!(saved.pinterestAccessToken && saved.pinterestBoardId),
    facebookConfigured: !!saved.facebookAccessToken,
    imageProvider: saved.imageProvider || 'cloudflare',
    imageBaseUrl: saved.imageBaseUrl || '',
    imageAccountId: saved.imageAccountId || '',
    imageModel: saved.imageModel || '',
    pinterestBoardId: saved.pinterestBoardId || '',
    facebookGraphVersion: saved.facebookGraphVersion || 'v23.0',
    textPrompt: saved.textPrompt || '',
    imagePrompt: saved.imagePrompt || '',
    pinterestPrompt: saved.pinterestPrompt || '',
    pinterestPrompts: Array.isArray(saved.pinterestPrompts)
      ? saved.pinterestPrompts
        .map((t) => ({ name: String(t && t.name || '').slice(0, 80), prompt: String(t && t.prompt || '').slice(0, 4000) }))
        .filter((t) => t.prompt.trim())
        .slice(0, 20)
      : [],
    articleImageCount: Number(saved.articleImageCount) || 0,
    scraperApiBaseUrl: saved.scraperApiBaseUrl || '',
    scraperApiConfigured: !!saved.scraperApiKey,
  };
}

// --------------------------------------------------------------------------
// Workspace
// --------------------------------------------------------------------------

function loadWorkspace() {
  return readJson('workspace.json', {});
}

function saveWorkspace(workspace) {
  const json = JSON.stringify(workspace == null ? {} : workspace);
  if (json.length > 1500000) {
    throw new Error('The local workspace is too large. Remove older drafts before adding more.');
  }
  writeJson('workspace.json', JSON.parse(json));
}

// --------------------------------------------------------------------------
// Settings lock (PBKDF2-v1, mirrors SettingsLockContract)
// --------------------------------------------------------------------------

function loadSettingsLock() {
  const file = readJson('lock.json', {});
  return { enabled: !!file.settingsLockHash };
}

function hashPin(pin) {
  const salt = crypto.randomBytes(16);
  const derived = crypto.pbkdf2Sync(String(pin), salt, PBKDF2_ITERATIONS, 32, 'sha256');
  return `pbkdf2-v1:${PBKDF2_ITERATIONS}:${salt.toString('base64')}:${derived.toString('base64')}`;
}

function normalizePin(value) { return String(value == null ? '' : value).trim(); }
function isValidPin(value) { const pin = normalizePin(value); return pin.length >= 4 && pin.length <= 12 && /^\d+$/.test(pin); }

function saveSettingsLock(pin) {
  const normalized = normalizePin(pin);
  if (!normalized) {
    writeJson('lock.json', {});
    return;
  }
  if (!isValidPin(normalized)) throw new Error('Settings PIN must contain 4 to 12 digits.');
  writeJson('lock.json', { settingsLockHash: hashPin(normalized) });
}

function verifySettingsLock(pin) {
  try {
    const normalized = normalizePin(pin);
    if (!isValidPin(normalized)) return false;
    const stored = String(readJson('lock.json', {}).settingsLockHash || '').trim();
    if (!stored) return false;
    if (stored.startsWith('pbkdf2-v1:')) {
      const parts = stored.split(':');
      if (parts.length !== 4) return false;
      const iterations = parseInt(parts[1], 10);
      if (!iterations || iterations < PBKDF2_ITERATIONS) return false;
      const salt = Buffer.from(parts[2], 'base64');
      const expected = Buffer.from(parts[3], 'base64');
      const actual = crypto.pbkdf2Sync(normalized, salt, iterations, 32, 'sha256');
      return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
    }
    if (/^[0-9a-fA-F]{64}$/.test(stored)) {
      const actual = crypto.createHash('sha256').update(normalized, 'utf8').digest();
      return crypto.timingSafeEqual(actual, Buffer.from(stored.toLowerCase(), 'hex'));
    }
    return false;
  } catch {
    return false;
  }
}

// --------------------------------------------------------------------------
// Generic named JSON stores (scheduler state, repair backups, sessions meta)
// --------------------------------------------------------------------------

function loadNamedStore(name, fallback) {
  if (!/^[a-z0-9_-]+$/i.test(name)) throw new Error('Invalid store name.');
  return readJson(name + '.json', fallback);
}

function saveNamedStore(name, value) {
  if (!/^[a-z0-9_-]+$/i.test(name)) throw new Error('Invalid store name.');
  writeJson(name + '.json', value);
}

module.exports = {
  DATA_DIR,
  getSiteSettings,
  saveSiteSettings,
  getSettingsSummary,
  allSettingsSummaries() {
    const file = readSettingsFile();
    const ids = new Set([SettingsPersistenceContract.DEFAULT_SITE_ID, ...Object.keys(file.sites || {})]);
    const out = {};
    ids.forEach((id) => { out[id] = getSettingsSummary(id); });
    return out;
  },
  loadWorkspace,
  saveWorkspace,
  loadSettingsLock,
  saveSettingsLock,
  verifySettingsLock,
  loadNamedStore,
  saveNamedStore,
};
