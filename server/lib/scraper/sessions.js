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
    authCookies: { c_user: null, xs: null },
    homeUrl: 'https://www.facebook.com/',
    usernameCandidates: ['input[name="email"]', '#email'],
    passwordCandidates: ['input[name="pass"]', '#pass'],
    submitCandidates: ['button[name="login"]', '#loginbutton', 'form[action*="login"] button[type="submit"]'],
  },
  pinterest: {
    loginUrl: 'https://www.pinterest.com/login/',
    // IMPORTANT: Pinterest keeps `_pinterest_sess` present even after logout
    // ("authentication tokens are deleted but we leave the cookie present").
    // The real proof of a signed-in session is `_auth=1`; checking only
    // `_pinterest_sess` is how a failed login gets falsely reported as
    // connected (every resource call then answers with auth code 2).
    sessionCookies: ['_pinterest_sess', '_auth'],
    authCookies: { _auth: '1' },
    homeUrl: 'https://www.pinterest.com/',
    usernameCandidates: ['input[name="id"]', 'input#email', 'input[type="email"]'],
    passwordCandidates: ['input[name="password"]', 'input#password', 'input[type="password"]'],
    submitCandidates: ['button[type="submit"]', '[data-test-id="registerFormSubmitButton"] button', 'form button.LLM'],
  },
};

/**
 * Presence alone is not enough: for Pinterest `_auth` must equal "1".
 * `authCookies: { name: expectedValue }` — null/undefined means "must exist".
 */
function isAuthenticated(platform, cookies) {
  const config = PLATFORMS[platform];
  if (!config) return false;
  const byName = new Map((cookies || []).map((cookie) => [cookie.name, cookie.value]));
  const required = config.authCookies || {};
  for (const [name, expected] of Object.entries(required)) {
    const value = byName.get(name);
    if (!value) return false;
    if (expected != null && value !== String(expected)) return false;
  }
  return config.sessionCookies.some((name) => !!byName.get(name));
}

const CODE_INPUT_SELECTORS = [
  'input[name="approvals_code"]', '#approvals_code',
  'input[autocomplete="one-time-code"]', 'input[name="code"]', 'input#code',
  'input[inputmode="numeric"]', 'input[name="captcha_response"]',
];

const liveContexts = new Map();

/**
 * A login that hit a verification challenge keeps its page alive here so the
 * user can finish it from the Settings card (code entry / phone approval).
 */
const PENDING_TTL_MS = 10 * 60 * 1000;
const pendingLogins = new Map(); // platform -> { page, context, challenge, createdAt }

setInterval(() => {
  const now = Date.now();
  for (const [platform, pending] of pendingLogins) {
    if (now - pending.createdAt > PENDING_TTL_MS) {
      pending.page.close().catch(() => {});
      pendingLogins.delete(platform);
    }
  }
}, 60 * 1000).unref();

function rememberPending(platform, page, context, challenge) {
  const old = pendingLogins.get(platform);
  if (old) old.page.close().catch(() => {});
  pendingLogins.set(platform, { page, context, challenge, createdAt: Date.now() });
}

function getPending(platform) {
  const pending = pendingLogins.get(platform);
  if (!pending) return null;
  if (Date.now() - pending.createdAt > PENDING_TTL_MS) {
    pending.page.close().catch(() => {});
    pendingLogins.delete(platform);
    return null;
  }
  return pending;
}

function clearPending(platform) {
  const pending = pendingLogins.get(platform);
  if (pending) pending.page.close().catch(() => {});
  pendingLogins.delete(platform);
}

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
    colorScheme: 'light',
    ignoreHTTPSErrors: false,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--no-sandbox',
      '--disable-features=IsolateOrigins,site-per-process,AutomationControlled',
    ],
  });
  // Basic anti-fingerprinting: Pinterest/Facebook challenge datacenter IPs
  // harder when the navigator looks like a normal Chrome.
  await context.addInitScript(() => {
    try {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5].map((i) => ({ name: `Plugin ${i}`, filename: `plugin${i}.dll`, description: '' })),
      });
      window.chrome = window.chrome || { runtime: {} };
    } catch { /* page may be cross-origin */ }
  });
  liveContexts.set(key, context);
  context.on('close', () => liveContexts.delete(key));
  return context;
}

/**
 * CAPTCHA detection that cannot false-positive on Pinterest's login page:
 * that page always EMBEDS the reCAPTCHA Enterprise script/config in its HTML,
 * so grepping raw markup for "captcha" reports a challenge that is not shown.
 * A real wall has a visible widget or visible human-check text.
 */
async function showsVisibleCaptcha(page) {
  const selectors = [
    'iframe[src*="recaptcha"]', 'iframe[src*="captcha"]', 'iframe[title*="captcha" i]',
    '#g-recaptcha', '.g-recaptcha', '.recaptcha-checkbox',
    '[data-testid*="captcha" i]', '[data-test-id*="captcha" i]',
    '#px-captcha', '.px-captcha',
  ];
  for (const selector of selectors) {
    try {
      const handle = await page.$(selector);
      if (handle && await handle.isVisible().catch(() => false)) return true;
    } catch { /* page navigating */ }
  }
  try {
    const text = await page.evaluate(() => (document.body ? document.body.innerText : '')).catch(() => '');
    if (/verify you('?re| are) human|confirm you('?re| are) human|unusual activity|security check|تحقق من أنك إنسان|نشاط غير معتاد/i.test(String(text))) {
      return true;
    }
  } catch { /* page navigating */ }
  return false;
}

async function closeAllContexts() {
  await Promise.all([...liveContexts.values()].map((context) => context.close().catch(() => {})));
  liveContexts.clear();
}

/**
 * Attempt a platform login through the server browser and persist the session.
 * Returns { connected, label } or throws with a clear, user-facing message.
 */
const CAPTCHA_GUIDANCE = 'عرضت المنصة اختبار تحقق بشري (CAPTCHA) على متصفح السيرفر، وهو شائع مع عناوين IP الخاصة بالخوادم ولا يمكن حله آلياً. الحل الأسهل: سجّل دخول حسابك في متصفحك العادي، ثم صدّر الكوكيز بإضافة «Cookie-Editor» (زر Export على صفحة المنصة) والصقها في حقل «استيراد الكوكيز» داخل هذه البطاقة — ستتصل الجلسة فوراً بلا CAPTCHA. أو انتظر بضع دقائق وأعد المحاولة.';

async function login(platform, credentials) {
  const config = platformConfig(platform);
  const username = String(credentials && credentials.username || '').trim();
  const password = String(credentials && credentials.password || '');
  if (!username || !password) throw new Error('Enter the account email/username and password.');
  const context = await getContext(platform);
  const page = await context.newPage();
  try {
    // One full attempt, plus a single fresh retry if a VISIBLE captcha blocks
    // the first one (datacenter IPs get challenged intermittently; the second
    // clean navigation often goes through).
    let outcome = await runLoginAttempt(platform, page, config, username, password);
    if (!outcome.authenticated && outcome.captcha) {
      await page.waitForTimeout(3000);
      outcome = await runLoginAttempt(platform, page, config, username, password, true);
    }
    if (outcome.authenticated) {
      return finishLogin(platform, context, username);
    }
    if (outcome.challenge) {
      const { challenge, codeInput } = outcome;
      rememberPending(platform, page, context, challenge);
      void codeInput;
      await saveLoginDebug(platform, page, `verification-${challenge}`);
      return {
        ...sessionStatus(platform),
        status: 'verification_required',
        challenge,
        challengeHint: challengeHint(platform, challenge),
      };
    }
    if (outcome.captcha) {
      await saveLoginDebug(platform, page, 'captcha');
      throw new Error(CAPTCHA_GUIDANCE);
    }
    if (outcome.formMissing) {
      await saveLoginDebug(platform, page, 'form-not-found');
      throw new Error('تعذّر العثور على نموذج الدخول في الصفحة التي عرضها الخادم (المنصة تُظهر تصميماً مختلفاً أو جدار تحقق). إن تكرر الأمر، استورد الكوكيز من متصفحك عبر حقل «استيراد الكوكيز» في البطاقة. حُفظت لقطة تشخيص في data/debug/.');
    }
    await saveLoginDebug(platform, page, 'no-session-cookie');
    if (platform === 'pinterest') {
      throw new Error('لم يؤكّد Pinterest الدخول (لا يوجد كوكي _auth=1). تحقق من البريد وكلمة المرور، وإن كان حسابك يسجّل الدخول عبر Google/Facebook فأضف كلمة مرور لحساب Pinterest من إعدادات الحساب ثم أعد المحاولة. أو استورد الكوكيز من متصفحك عبر حقل الاستيراد بالبطاقة إن ظهر CAPTCHA. حُفظت لقطة تشخيص في data/debug/.');
    }
    throw new Error('لم يُؤكَّد الدخول. تحقق من البيانات وأعد المحاولة (كلمات المرور الخاطئة لا تُنشئ جلسة). حُفظت لقطة تشخيص في data/debug/ على السيرفر.');
  } catch (error) {
    if (!/data\/debug\//.test(String(error.message))) {
      await saveLoginDebug(platform, page, 'error').catch(() => {});
    }
    throw normalizeLoginError(error);
  } finally {
    if (!pendingLogins.has(platform)) {
      await page.close().catch(() => {});
    }
  }
}

/**
 * One login-page round trip: load, fill, submit, poll for the real auth
 * markers. Returns a structured outcome so login() can retry once.
 */
async function runLoginAttempt(platform, page, config, username, password, isRetry = false) {
  const context = page.context();
  await page.goto(config.loginUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(isRetry ? 4000 : 2500);
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
    if (await showsVisibleCaptcha(page)) return { authenticated: false, captcha: true };
    return { authenticated: false, formMissing: true };
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

  // Real auth markers take a few redirects to land. Poll instead of trusting
  // one early snapshot — Pinterest also sets `_pinterest_sess` for guests,
  // so a single early cookie read reports false "connected".
  let captcha = false;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await page.waitForTimeout(2500);
    if (isAuthenticated(platform, await context.cookies())) {
      // Load home once so the full cookie set (csrftoken, routing…) is present
      // before the publisher sends its first request.
      await page.goto(config.homeUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(2000);
      return { authenticated: true };
    }
    const codeInput = await page.$(CODE_INPUT_SELECTORS.join(','));
    if (codeInput && await codeInput.isVisible().catch(() => false)) {
      return { authenticated: false, challenge: codeInput ? 'code' : 'device_approval', codeInput };
    }
    if (await showsVisibleCaptcha(page)) captcha = true;
    // Some flows finish over XHR and stay on the login URL; a gentle nudge to
    // home reveals whether the session is live. Skip while a code box is on
    // screen — that is a challenge the user has to finish.
    if (attempt === 5 && !(await page.$(CODE_INPUT_SELECTORS.join(',')))) {
      await page.goto(config.homeUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    }
  }

  const currentUrl = page.url();
  const codeInput = await page.$(CODE_INPUT_SELECTORS.join(','));
  const isCheckpoint = /checkpoint|approvals_code|two[_-]?factor|two[_-]?step|verification|verify|security-check|login\/cookie/i.test(currentUrl) || !!(codeInput && await codeInput.isVisible().catch(() => false));
  if (isCheckpoint) {
    return { authenticated: false, challenge: codeInput ? 'code' : 'device_approval', codeInput };
  }
  if (captcha || await showsVisibleCaptcha(page)) return { authenticated: false, captcha: true };
  return { authenticated: false };
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

/** Same snapshot bundle used for scans: data/debug/<platform>-scan-<tag>-<ts>.{png,html,url.txt} */
async function captureDebug(platform, page, tag) {
  return saveLoginDebug(platform, page, `scan-${tag}`);
}

function challengeHint(platform, challenge) {
  if (platform === 'pinterest') {
    return challenge === 'code'
      ? 'أدخل رمز التحقق الذي أرسله Pinterest إلى بريدك الإلكتروني (أو تطبيق المصادقة) في الحقل أدناه.'
      : 'أكّد محاولة الدخول من بريدك أو تطبيق Pinterest، ثم اضغط زر التحقق أدناه.';
  }
  return challenge === 'code'
    ? 'أدخل رمز التحقق الذي وصلك (تطبيق المصادقة / SMS / بريد فيسبوك) في البطاقة هنا.'
    : 'وافق على هذا الدخول من تطبيق فيسبوك على هاتفك (إشعار "هل كنت أنت؟")، ثم اضغط زر التحقق هنا.';
}

function normalizeLoginError(error) {
  const message = String(error && error.message || 'Login failed.');
  if (/Timeout.*exceeded/i.test(message)) {
    return new Error('The login page did not respond in time (the platform may be showing a verification or consent wall to this server). Try again, and if it persists open the snapshot in data/debug/ on the server or send it for analysis.');
  }
  return error instanceof Error ? error : new Error(message);
}

async function finishLogin(platform, context, username) {
  const cookies = await context.cookies();
  clearPending(platform);
  const meta = metaStore();
  meta.platforms[platform] = {
    connected: true,
    label: labelFromCookies(platform, cookies) || username.replace(/(.{2}).+(@.+)/, '$1…$2'),
    lastLoginAt: new Date().toISOString(),
  };
  saveNamedStore('sessions-meta', meta);
  return { ...sessionStatus(platform), status: 'connected' };
}

/**
 * Finish a pending verification challenge:
 *  - challenge 'code': type the verification code into the live page and submit
 *  - challenge 'device_approval': user approved the login on their phone; we
 *    click the checkpoint "continue" and re-validate the session cookies
 */
async function submitVerification(platform, code) {
  const pending = getPending(platform);
  if (!pending) {
    throw new Error('لا توجد محاولة تحقق نشطة (انتهت مهلة 10 دقائق أو بدأت محاولة جديدة). أعد تسجيل الدخول من البداية.');
  }
  const config = platformConfig(platform);
  void config;
  const { page, context } = pending;
  pending.createdAt = Date.now(); // activity extends the window

  if (pending.challenge === 'code') {
    const cleanCode = String(code || '').replace(/\s+/g, '');
    if (!cleanCode) throw new Error('أدخل رمز التحقق أولاً.');
    const codeField = await findFirst(page, CODE_INPUT_SELECTORS);
    if (!codeField) throw new Error('حقل الرمز لم يعد ظاهراً في الصفحة — أعد تسجيل الدخول.');
    await codeField.fill(cleanCode);
    const submit = await page.$('#checkpointSubmitButton')
      || await page.$('button[type="submit"]:not([disabled])')
      || await page.$('form button[type="submit"]');
    if (submit) await submit.click({ timeout: 5000 }).catch(() => {});
    else await codeField.press('Enter');
  } else {
    // device approval: user pushed "Approve" in their phone app; continue the flow
    const continueButton = await page.$('#checkpointSubmitButton')
      || await page.$('button[type="submit"][name="submit[Continue]"]')
      || await page.$('button[type="submit"]:not([disabled])');
    if (continueButton) await continueButton.click({ timeout: 5000 }).catch(() => {});
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  }
  await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});

  // The platform can take a few redirects to mint the session; poll the real
  // auth markers (Pinterest's guest `_pinterest_sess` is not proof of login).
  let authenticated = false;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await page.waitForTimeout(2500);
    if (isAuthenticated(platform, await context.cookies())) { authenticated = true; break; }
    if (attempt === 6) await page.goto(PLATFORMS[platform].homeUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  }
  if (authenticated) return finishLogin(platform, context, '');

  const url = page.url();
  const html = await page.content();
  // Still on a code page? Probably a wrong code.
  if (pending.challenge === 'code' && /approvals_code|checkpoint|two[_-]?factor|two[_-]?step|verification|verify/i.test(url + html.slice(0, 3000))) {
    throw new Error(platform === 'pinterest'
      ? 'الرمز لم يقبله Pinterest — تأكد أنه الأحدث الذي وصلك بالبريد أو تطبيق المصادقة وأعد المحاولة.'
      : 'الرمز لم يُقبل — تأكد أنه الأحدث من تطبيق المصادقة/الرسائل وأعد المحاولة.');
  }
  const freshCodeInput = await page.$(CODE_INPUT_SELECTORS.join(','));
  if (freshCodeInput) {
    pending.challenge = 'code';
    throw new Error('التحقق لم يكتمل بعد — أُظهر حقل رمز جديد؛ أدخله وأعد المحاولة.');
  }
  await saveLoginDebug(platform, page, 'verification-stuck');
  throw new Error('لم تتأكد الجلسة بعد. إن وافقتَ على الدخول من هاتفك بالفعل، انتظر ثواني وأعد الضغط؛ وإلا أعد تسجيل الدخول من البداية.');
}

/**
 * Re-validate a stored profile against the live site and update its connected
 * flag. This is how the Settings card can downgrade a stale "connected" label
 * (Pinterest leaves the session cookie in place after logout/expiry).
 */
async function verifyConnected(platform) {
  platformConfig(platform);
  if (!fs.existsSync(profileDir(platform))) {
    return sessionStatus(platform);
  }
  const context = await getContext(platform);
  const page = await context.newPage();
  try {
    await page.goto(PLATFORMS[platform].homeUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await dismissConsentWalls(page);
    await page.waitForTimeout(4000);
    const cookies = await context.cookies();
    const ok = isAuthenticated(platform, cookies);
    const meta = metaStore();
    const entry = meta.platforms[platform] || {};
    entry.connected = ok;
    entry.lastVerifiedAt = new Date().toISOString();
    if (ok) {
      entry.lastLoginAt = entry.lastLoginAt || entry.lastVerifiedAt;
      entry.label = labelFromCookies(platform, cookies) || entry.label || platform;
    }
    meta.platforms[platform] = entry;
    saveNamedStore('sessions-meta', meta);
    return sessionStatus(platform);
  } finally {
    await page.close().catch(() => {});
  }
}

// --- cookie import: bypass server-browser CAPTCHA with the user's own ------
// logged-in browser session. Cookies never leave this server: they are seeded
// straight into the same persistent Playwright profile the scanner uses.

function normalizeSameSite(value) {
  const v = String(value || '').toLowerCase();
  if (v.includes('none') || v.includes('no_restriction')) return 'None';
  if (v.includes('strict')) return 'Strict';
  return 'Lax';
}

/**
 * Parse pasted cookies in three common shapes into Playwright addCookies()
 * entries:
 *   1. Cookie-Editor extension JSON export (array or { cookies: [...] })
 *   2. Netscape cookies.txt (tab separated, #HttpOnly_ tolerated)
 *   3. A raw "Cookie:" header line (name=value; name2=value2)
 */
function parseCookieImport(platform, raw) {
  const text = String(raw || '').trim();
  if (!text) throw new Error('الصق الكوكيز أولاً.');
  const rootDomain = platform === 'pinterest' ? '.pinterest.com' : '.facebook.com';
  const out = [];
  const push = (cookie) => {
    if (!cookie || !cookie.name || cookie.value === undefined || cookie.value === null) return;
    const entry = {
      name: String(cookie.name),
      value: String(cookie.value),
      domain: cookie.domain || rootDomain,
      path: cookie.path || '/',
      httpOnly: !!cookie.httpOnly,
      secure: cookie.secure !== false,
      sameSite: normalizeSameSite(cookie.sameSite),
    };
    const expires = Number(cookie.expires != null ? cookie.expires : cookie.expirationDate);
    if (Number.isFinite(expires) && expires > 0) entry.expires = Math.floor(expires);
    if (entry.sameSite === 'None') entry.secure = true;
    out.push(entry);
  };

  if (text[0] === '[' || text[0] === '{') {
    let parsed;
    try { parsed = JSON.parse(text); } catch { throw new Error('نص JSON غير صالح. صدّر الكوكيز مجدداً من إضافة Cookie-Editor (زر Export).'); }
    const list = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.cookies) ? parsed.cookies : []);
    if (!list.length) throw new Error('ملف JSON لا يحتوي كوكيز.');
    for (const c of list) push(c);
  } else if (/\t/.test(text) && /(?:^|\n)(?:#HttpOnly_)?\.?[a-z0-9.-]+\.[a-z]{2,}\t/i.test(text)) {
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim() || line.trim().startsWith('#') && !line.startsWith('#HttpOnly_')) continue;
      const parts = line.replace(/^#HttpOnly_/, '').split('\t');
      if (parts.length < 7) continue;
      const [domain, , cookiePath, secure, expiration, name, ...valueParts] = parts;
      push({
        name, value: valueParts.join('\t'), domain, path: cookiePath || '/',
        secure: /^true$/i.test(secure.trim()), expires: Number(expiration),
        httpOnly: line.startsWith('#HttpOnly_'), sameSite: 'Lax',
      });
    }
  } else {
    for (const part of text.split(';')) {
      const idx = part.indexOf('=');
      if (idx <= 0) continue;
      const name = part.slice(0, idx).trim();
      const value = part.slice(idx + 1).trim();
      if (!name) continue;
      push({ name, value, domain: rootDomain, path: '/', secure: true, httpOnly: true, sameSite: 'Lax' });
    }
  }

  if (!out.length) {
    throw new Error('لم أتعرف على أي كوكيز في النص الملصوق. استخدم زر Export في Cookie-Editor أو الصق سطر Cookie كاملاً.');
  }
  return out;
}

/**
 * Seed the persistent profile with cookies copied from the user's own
 * browser, then prove against the live site that they form a real login.
 */
async function importCookies(platform, raw) {
  platformConfig(platform);
  const cookies = parseCookieImport(platform, raw);
  const config = PLATFORMS[platform];
  const context = await getContext(platform);
  const page = await context.newPage();
  try {
    // Establish the origin before adding domain cookies.
    await page.goto(config.homeUrl, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
    await context.clearCookies().catch(() => {});
    const valid = cookies.filter((c) => c.domain && /(pinterest|facebook)\./.test(c.domain));
    if (!valid.length) throw new Error('لا توجد كوكيز تخص Pinterest/Facebook في النص الملصوق. تأكد أنك صدّرت الكوكيز من صفحة المنصة نفسها.');
    await context.addCookies(valid);

    let authenticated = false;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      await page.goto(config.homeUrl, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
      await page.waitForTimeout(2500);
      if (isAuthenticated(platform, await context.cookies())) { authenticated = true; break; }
    }
    if (!authenticated) {
      await saveLoginDebug(platform, page, 'cookie-import-unauth');
      if (platform === 'pinterest') {
        throw new Error('الكوكيز المستوردة لا تُمثّل جلسة دخول (لم يظهر كوكي _auth=1). افتح pinterest.com في متصفحك وتأكد أنك داخل حسابك فعلاً، ثم اضغط Export في Cookie-Editor من جديد والصق النص فوراً (لا تُسجّل الخروج بعد النسخ).');
      }
      throw new Error('الكوكيز المستوردة لا تُمثّل جلسة دخول. كرّر التصدير وأنت مسجّل الدخول فعلاً على صفحة المنصة.');
    }
    return finishLogin(platform, context, '');
  } finally {
    await page.close().catch(() => {});
  }
}

function verificationState(platform) {
  platformConfig(platform);
  const pending = getPending(platform);
  return {
    pending: !!pending,
    challenge: pending ? pending.challenge : null,
    expiresInSec: pending ? Math.max(0, Math.round((PENDING_TTL_MS - (Date.now() - pending.createdAt)) / 1000)) : 0,
  };
}

async function cancelVerification(platform) {
  platformConfig(platform);
  clearPending(platform);
  return { ok: true };
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
  verifyConnected,
  importCookies,
  parseCookieImport,
  isAuthenticated,
  submitVerification,
  verificationState,
  cancelVerification,
  captureDebug,
};
