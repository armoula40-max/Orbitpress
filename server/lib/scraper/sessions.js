'use strict';
/**
 * sessions.js — built-in server browser sessions for Facebook/Pinterest.
 *
 * Replaces the old flow where the Android app uploaded your cookies to an
 * external VPS scraper API. Here a persistent headless Chromium profile lives
 * on the server; you sign in once through the Settings screen and the scraper
 * reuses that session. No API keys, no cookie uploads.
 *
 * The login flow never bypasses CAPTCHA/2FA — if the platform asks for a
 * challenge, the login attempt reports it clearly so you can finish it in a
 * normal browser, then retry.
 */
const fs = require('fs');
const path = require('path');
const { DATA_DIR, loadNamedStore, saveNamedStore } = require('../store');

const SESSIONS_DIR = path.join(DATA_DIR, 'sessions');
fs.mkdirSync(SESSIONS_DIR, { recursive: true });

const PLATFORMS = {
  facebook: {
    loginUrl: 'https://www.facebook.com/login',
    sessionCookies: ['c_user', 'xs'],
    homeUrl: 'https://www.facebook.com/',
    usernameCandidates: ['input[name="email"]', '#email'],
    passwordCandidates: ['input[name="pass"]', '#pass'],
    submitCandidates: ['button[name="login"]', '#loginbutton', 'form[action*="login"] button[type="submit"]'],
  },
  pinterest: {
    loginUrl: 'https://www.pinterest.com/login/',
    sessionCookies: ['_pinterest_sess'],
    homeUrl: 'https://www.pinterest.com/',
    usernameCandidates: ['input[name="id"]', 'input#email', 'input[type="email"]'],
    passwordCandidates: ['input[name="password"]', 'input#password', 'input[type="password"]'],
    submitCandidates: ['button[type="submit"]', '[data-test-id="registerFormSubmitButton"] button', 'form button.LLM'],
  },
};

const liveContexts = new Map();

function playwright() {
  try {
    return require('playwright');
  } catch {
    throw new Error('Playwright is not installed on this server. Run `npm run install-browser` (or `npx playwright install chromium`) first.');
  }
}

function platformConfig(platform) {
  const config = PLATFORMS[String(platform || '').toLowerCase()];
  if (!config) throw new Error('Unsupported social platform.');
  return config;
}

function profileDir(platform) {
  return path.join(SESSIONS_DIR, `${platform}-profile`);
}

function metaStore() {
  return loadNamedStore('sessions-meta', { platforms: {} });
}

function sessionStatus(platform) {
  const config = PLATFORMS[platform] ? platform : null;
  void config;
  const meta = metaStore().platforms[platform] || null;
  const hasProfile = fs.existsSync(profileDir(platform));
  return {
    platform,
    connected: !!(meta && meta.connected && hasProfile),
    label: meta && meta.label ? meta.label : '',
    lastLoginAt: meta && meta.lastLoginAt ? meta.lastLoginAt : null,
    note: hasProfile && !(meta && meta.connected) ? 'A stored profile exists but has not been verified yet.' : '',
  };
}

function statuses() {
  return { facebook: sessionStatus('facebook'), pinterest: sessionStatus('pinterest') };
}

async function getContext(platform, { headless = true } = {}) {
  const pw = playwright();
  const key = `${platform}:${headless ? 'headless' : 'headed'}`;
  if (liveContexts.has(key)) return liveContexts.get(key);
  const context = await pw.chromium.launchPersistentContext(profileDir(platform), {
    headless,
    viewport: { width: 1280, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    locale: 'en-US',
    ignoreHTTPSErrors: false,
    args: ['--disable-blink-features=AutomationControlled', '--disable-dev-shm-usage', '--no-sandbox'],
  });
  liveContexts.set(key, context);
  context.on('close', () => liveContexts.delete(key));
  return context;
}

async function closeAllContexts() {
  await Promise.all([...liveContexts.values()].map((context) => context.close().catch(() => {})));
  liveContexts.clear();
}

/**
 * Attempt a platform login through the server browser and persist the session.
 * Returns { connected, label } or throws with a clear, user-facing message.
 */
async function login(platform, credentials) {
  const config = platformConfig(platform);
  const username = String(credentials && credentials.username || '').trim();
  const password = String(credentials && credentials.password || '');
  if (!username || !password) throw new Error('Enter the account email/username and password.');
  const context = await getContext(platform);
  const page = await context.newPage();
  try {
    await page.goto(config.loginUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2500);
    await dismissConsentWalls(page);
    await page.waitForTimeout(500);

    const userInput = await findFirst(page, [
      ...config.usernameCandidates,
      'input[name="email"]', 'input#email', 'input[type="email"]', 'input[autocomplete="username"]',
    ]);
    const passInput = await findFirst(page, [
      ...config.passwordCandidates,
      'input[name="pass"]', 'input[type="password"]', 'input[autocomplete="current-password"]',
    ]);
    if (!userInput || !passInput) {
      await saveLoginDebug(platform, page, 'form-not-found');
      throw new Error('The login form could not be found on the served page (the platform shows a different layout to this server). A debug screenshot+HTML snapshot was saved on the server under data/debug/ — send it for analysis, or try again in a minute.');
    }
    await userInput.fill(username);
    await passInput.fill(password);
    await dismissConsentWalls(page);

    // Submit: dedicated button first, Enter as the universal fallback.
    let submitted = false;
    for (const selector of [...config.submitCandidates, 'button[name="login"]', '#loginbutton', 'button[type="submit"]']) {
      try {
        const button = await page.waitForSelector(selector, { timeout: 4000, state: 'visible' });
        if (button) { await button.click({ timeout: 5000 }); submitted = true; break; }
      } catch { /* try next candidate */ }
    }
    if (!submitted) {
      await passInput.press('Enter');
    }
    await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(6000);

    const currentUrl = page.url();
    const pageHtml = await page.content();
    if (/checkpoint|approvals_code|two[_-]?factor/i.test(currentUrl + pageHtml.slice(0, 4000))) {
      await saveLoginDebug(platform, page, 'checkpoint');
      throw new Error('The platform asked for a verification challenge (2FA/checkpoint). Open facebook.com or pinterest.com in your normal browser, complete the verification, then try the login again.');
    }
    if (/captcha|recaptcha/i.test(pageHtml.slice(0, 6000))) {
      await saveLoginDebug(platform, page, 'captcha');
      throw new Error('The platform presented a CAPTCHA this server cannot solve. Complete a login in your normal browser first, then retry.');
    }
    const cookies = await context.cookies();
    const found = config.sessionCookies.filter((name) => cookies.some((cookie) => cookie.name === name && cookie.value));
    if (!found.length) {
      await saveLoginDebug(platform, page, 'no-session-cookie');
      throw new Error('Login was not confirmed. Check the credentials and try again (wrong passwords do not create a session). A debug snapshot was saved under data/debug/.');
    }
    const meta = metaStore();
    meta.platforms[platform] = {
      connected: true,
      label: labelFromCookies(platform, cookies) || username.replace(/(.{2}).+(@.+)/, '$1…$2'),
      lastLoginAt: new Date().toISOString(),
    };
    saveNamedStore('sessions-meta', meta);
    return sessionStatus(platform);
  } catch (error) {
    if (!/data\/debug\//.test(String(error.message))) {
      await saveLoginDebug(platform, page, 'error').catch(() => {});
    }
    throw normalizeLoginError(error);
  } finally {
    await page.close().catch(() => {});
  }
}

const CONSENT_SELECTORS = [
  'button[data-cookiebanner="accept_button"]',
  'button[data-cookiebanner="accept_only_essential_button"]',
  'button[title="Allow all cookies"]',
  'button[title="Accept all"]',
  '[aria-label="Allow all cookies"]',
  '[aria-label="Accept all"]',
  '[data-testid="cookie-policy-manage-dialog-accept-button"]',
  'form[action*="consent"] button[type="submit"]',
  'button#__btnAcceptAll',
];

async function dismissConsentWalls(page) {
  for (const selector of CONSENT_SELECTORS) {
    try {
      const button = await page.$(selector);
      if (button && await button.isVisible().catch(() => false)) {
        await button.click({ timeout: 2000 }).catch(() => {});
        await page.waitForTimeout(900);
      }
    } catch { /* not present */ }
  }
  // text-based fallbacks (English + the common localized variants)
  for (const label of ['Allow all cookies', 'Accept all', 'Allow essential and optional cookies', 'Accepter tout', 'قبول الكل']) {
    try {
      const button = page.getByRole('button', { name: label, exact: false });
      if (await button.count() > 0) {
        await button.first().click({ timeout: 2000 }).catch(() => {});
        await page.waitForTimeout(900);
        break;
      }
    } catch { /* ignore */ }
  }
}

async function findFirst(page, selectors) {
  for (const selector of selectors) {
    try {
      const handle = await page.waitForSelector(selector, { timeout: 5000, state: 'visible' });
      if (handle) return handle;
    } catch { /* try next */ }
  }
  return null;
}

async function saveLoginDebug(platform, page, tag) {
  try {
    const dir = path.join(DATA_DIR, 'debug');
    fs.mkdirSync(dir, { recursive: true });
    const stamp = `${platform}-${tag}-${Date.now()}`;
    await page.screenshot({ path: path.join(dir, `${stamp}.png`), fullPage: false }).catch(() => {});
    fs.writeFileSync(path.join(dir, `${stamp}.html`), await page.content().catch(() => ''));
    fs.writeFileSync(path.join(dir, `${stamp}.url.txt`), page.url());
  } catch { /* never break login over debugging */ }
}

function normalizeLoginError(error) {
  const message = String(error && error.message || 'Login failed.');
  if (/Timeout.*exceeded/i.test(message)) {
    return new Error('The login page did not respond in time (the platform may be showing a verification or consent wall to this server). Try again, and if it persists open the snapshot in data/debug/ on the server or send it for analysis.');
  }
  return error instanceof Error ? error : new Error(message);
}

function labelFromCookies(platform, cookies) {
  if (platform === 'facebook') {
    const user = cookies.find((cookie) => cookie.name === 'c_user');
    return user ? `Facebook account ${user.value}` : '';
  }
  if (platform === 'pinterest') {
    return 'Pinterest session';
  }
  return '';
}

/** Cookies for seeding plain-HTTP scraper requests with the stored session. */
async function cookiesFor(platform) {
  const config = platformConfig(platform);
  if (!fs.existsSync(profileDir(platform))) return [];
  try {
    const context = await getContext(platform);
    const cookies = await context.cookies();
    return cookies.filter((cookie) => /facebook\.com$/.test(cookie.domain) || /pinterest\.com$/.test(cookie.domain) || config.sessionCookies.includes(cookie.name));
  } catch {
    return [];
  }
}

async function cookieHeader(platform) {
  const cookies = await cookiesFor(platform);
  const seen = new Map();
  cookies.forEach((cookie) => seen.set(cookie.name, cookie.value));
  return [...seen.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
}

async function logout(platform) {
  platformConfig(platform);
  const keyPrefix = `${platform}:`;
  await Promise.all([...liveContexts.entries()]
    .filter(([key]) => key.startsWith(keyPrefix))
    .map(([key, context]) => context.close().catch(() => {}).then(() => liveContexts.delete(key))));
  fs.rmSync(profileDir(platform), { recursive: true, force: true });
  const meta = metaStore();
  delete meta.platforms[platform];
  saveNamedStore('sessions-meta', meta);
  return { ok: true };
}

module.exports = {
  PLATFORMS,
  getContext,
  closeAllContexts,
  login,
  logout,
  sessionStatus,
  statuses,
  cookieHeader,
};
