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
const { loadNamedStore, saveNamedStore } = require('../store');
const reqContext = require('../reqContext');

// Per-tenant persistent browser profiles: each access-code user keeps their
// own Pinterest/Facebook cookies; the master owner keeps data/sessions.
function sessionsDir() {
  const dir = path.join(reqContext.getDataDir(), 'sessions');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

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
  return path.join(sessionsDir(), `${platform}-profile`);
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
    const cookiesNow = await context.cookies();
    const hasSession = config.sessionCookies.some((name) => cookiesNow.some((cookie) => cookie.name === name && cookie.value));
    if (hasSession) {
      return finishLogin(platform, context, username);
    }

    // Verification challenge? Keep the page alive and hand the user control.
    const codeInput = await page.$('input[name="approvals_code"], #approvals_code, input[autocomplete="one-time-code"], input[name="captcha_response"]');
    const isCheckpoint = /checkpoint|approvals_code|two[_-]?factor|two_step|login\/cookie/i.test(currentUrl) || !!codeInput;
    if (!hasSession && isCheckpoint) {
      const challenge = codeInput ? 'code' : 'device_approval';
      rememberPending(platform, page, context, challenge);
      await saveLoginDebug(platform, page, `verification-${challenge}`);
      return {
        ...sessionStatus(platform),
        status: 'verification_required',
        challenge,
        challengeHint: challenge === 'code'
          ? 'أدخل رمز التحقق الذي وصلك (تطبيق المصادقة / SMS / بريد فيسبوك) في البطاقة هنا.'
          : 'وافق على هذا الدخول من تطبيق فيسبوك على هاتفك (إشعار "هل كنت أنت؟")، ثم اضغط زر التحقق هنا.',
      };
    }
    if (/captcha|recaptcha/i.test(pageHtml.slice(0, 6000))) {
      await saveLoginDebug(platform, page, 'captcha');
      throw new Error('المنصة عرضت CAPTCHA لا يمكن للسيرفر حلّها. سجّل دخول نفس الحساب من متصفحك العادي أكمل التحقق ثم أعد المحاولة.');
    }
    await saveLoginDebug(platform, page, 'no-session-cookie');
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
    const dir = path.join(getDataDir(), 'debug');
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
  const { page, context } = pending;
  pending.createdAt = Date.now(); // activity extends the window

  if (pending.challenge === 'code') {
    const cleanCode = String(code || '').replace(/\s+/g, '');
    if (!cleanCode) throw new Error('أدخل رمز التحقق أولاً.');
    const codeField = await page.$('input[name="approvals_code"], #approvals_code, input[autocomplete="one-time-code"]');
    if (!codeField) throw new Error('حقل الرمز لم يعد ظاهراً في الصفحة — أعد تسجيل الدخول.');
    await codeField.fill(cleanCode);
    const submit = await page.$('#checkpointSubmitButton') || await page.$('button[type="submit"]');
    if (submit) await submit.click().catch(() => {});
    else await codeField.press('Enter');
  } else {
    // device approval: user pushed "Approve" in their Facebook app; continue the flow
    const continueButton = await page.$('#checkpointSubmitButton') || await page.$('button[type="submit"][name="submit[Continue]"]') || await page.$('button');
    if (continueButton) await continueButton.click().catch(() => {});
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  }
  await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(5000);

  const cookies = await context.cookies();
  const hasSession = config.sessionCookies.some((name) => cookies.some((cookie) => cookie.name === name && cookie.value));
  if (hasSession) return finishLogin(platform, context, '');

  const url = page.url();
  const html = await page.content();
  // Still on a code page? Probably a wrong code.
  if (pending.challenge === 'code' && /approvals_code|checkpoint|two[_-]?step/i.test(url + html.slice(0, 3000))) {
    throw new Error('الرمز لم يُقبل — تأكد أنه الأحدث من تطبيق المصادقة/الرسائل وأعد المحاولة.');
  }
  const freshCodeInput = await page.$('input[name="approvals_code"], #approvals_code');
  if (freshCodeInput) {
    pending.challenge = 'code';
    throw new Error('التحقق لم يكتمل بعد — أُظهر حقل رمز جديد؛ أدخله وأعد المحاولة.');
  }
  await saveLoginDebug(platform, page, 'verification-stuck');
  throw new Error('لم تتأكد الجلسة بعد. إن وافقتَ على الدخول من هاتفك بالفعل، انتظر ثواني وأعد الضغط؛ وإلا أعد تسجيل الدخول من البداية.');
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

/**
 * The same success rule login() uses: a session cookie is present in the jar.
 * This is deliberately lenient — Pinterest keeps `_pinterest_sess` for guests,
 * but a stored persistent profile only contains it after a real login, and
 * stricter name-based checks (_auth=1) wrongly downgraded valid sessions whose
 * accounts never receive that cookie.
 */
function hasSessionCookies(platform, cookies) {
  const config = PLATFORMS[platform];
  if (!config) return false;
  const names = new Set((cookies || []).map((cookie) => cookie.name));
  return config.sessionCookies.some((name) => names.has(name));
}

// --- cookie import: bypass server-browser CAPTCHA with the user's own ------
// logged-in browser session. Cookies never leave this server: they are seeded
// straight into the same persistent Playwright profile the scanner uses.

function normalizeSameSite(value) {
  const v = String(value || '').toLowerCase();
  if (v.includes('none') || v.includes('no_restriction')) return 'None';
  if (v.includes('strict')) return 'Strict';
  if (v.includes('lax')) return 'Lax';
  return 'Lax';
}

function platformCookieRoots(platform) {
  if (platform === 'pinterest') return { rootDomain: '.pinterest.com', rootUrl: 'https://www.pinterest.com/' };
  return { rootDomain: '.facebook.com', rootUrl: 'https://www.facebook.com/' };
}

/**
 * Turn one parsed cookie into the shape Playwright/CDP accepts. CDP
 * Storage.setCookies rejects the WHOLE batch ("Invalid cookie fields") on one
 * bad entry, so every rule is enforced here (see the import loop below).
 */
function normalizePlaywrightCookie(cookie, platform) {
  if (!cookie || !cookie.name || cookie.value === undefined || cookie.value === null) return null;
  const name = String(cookie.name).trim();
  if (!name || /[\s;=]/.test(name)) return null;
  const { rootDomain, rootUrl } = platformCookieRoots(platform);
  const rawDomain = String(cookie.domain || '').trim().toLowerCase();
  const domain = /^\.?[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(rawDomain) ? rawDomain : rootDomain;
  const path = /^\//.test(String(cookie.path || '')) ? String(cookie.path) : '/';
  let secure = cookie.secure !== false;
  const sameSite = ['Strict', 'Lax', 'None'].includes(cookie.sameSite)
    ? cookie.sameSite
    : normalizeSameSite(cookie.sameSite);
  const hostPrefix = /^__host-/i.test(name);
  if (/^__secure-/i.test(name) || hostPrefix || sameSite === 'None') secure = true;

  const entry = { name, value: String(cookie.value), httpOnly: !!cookie.httpOnly, secure, sameSite };
  if (hostPrefix) {
    // __Host- cookies forbid a Domain attribute: bind them to the origin URL.
    entry.url = rootUrl;
  } else {
    entry.domain = domain;
    entry.path = path;
  }
  const expires = Number(cookie.expires != null ? cookie.expires : cookie.expirationDate);
  if (Number.isFinite(expires) && Math.floor(expires) > Math.floor(Date.now() / 1000)) {
    entry.expires = Math.floor(expires); // past/zero expiry → session cookie
  }
  return entry;
}

/**
 * Parse pasted cookies into Playwright addCookies() entries. Accepted shapes:
 *   1. Cookie-Editor extension JSON export (array or { cookies: [...] })
 *   2. Netscape cookies.txt (tab separated, #HttpOnly_ tolerated)
 *   3. A raw "Cookie:" header line (name=value; name2=value2)
 */
function parseCookieImport(platform, raw) {
  const text = String(raw || '').trim();
  if (!text) throw new Error('الصق الكوكيز أولاً.');
  const { rootDomain } = platformCookieRoots(platform);
  const out = [];
  const push = (cookie) => {
    const entry = normalizePlaywrightCookie(cookie, platform);
    if (entry) out.push(entry);
  };

  if (text[0] === '[' || text[0] === '{') {
    let parsed;
    try { parsed = JSON.parse(text); } catch { throw new Error('نص JSON غير صالح. صدّر الكوكيز مجدداً من إضافة Cookie-Editor (زر Export).'); }
    const list = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.cookies) ? parsed.cookies : []);
    if (!list.length) throw new Error('ملف JSON لا يحتوي كوكيز.');
    for (const c of list) push(c);
  } else if (/\t/.test(text) && /(?:^|\n)(?:#HttpOnly_)?\.?[a-z0-9.-]+\.[a-z]{2,}\t/i.test(text)) {
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim() || (line.trim().startsWith('#') && !line.startsWith('#HttpOnly_'))) continue;
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
      if (name) push({ name, value, domain: rootDomain, path: '/', secure: true, httpOnly: true, sameSite: 'Lax' });
    }
  }

  if (!out.length) {
    throw new Error('لم أتعرف على أي كوكيز في النص الملصوق. استخدم زر Export في Cookie-Editor أو الصق سطر Cookie كاملاً.');
  }
  return out;
}

/**
 * Seed the persistent profile with cookies copied from the user's browser and
 * accept them using the SAME presence rule a successful interactive login
 * uses (this profile only carries the platform session cookie after a real
 * login). Cookies are added one by one so a single malformed entry cannot
 * abort the rest.
 */
async function importCookies(platform, raw) {
  platformConfig(platform);
  const cookies = parseCookieImport(platform, raw);
  const config = PLATFORMS[platform];
  const context = await getContext(platform);
  const page = await context.newPage();
  try {
    await page.goto(config.homeUrl, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
    await context.clearCookies().catch(() => {});
    const suffix = platform === 'pinterest' ? 'pinterest.' : 'facebook.';
    const belongs = (c) => (c.url && c.url.includes(suffix)) || (c.domain && c.domain.includes(suffix));
    const valid = cookies.filter(belongs);
    if (!valid.length) {
      throw new Error('لا توجد كوكيز تخص المنصة في النص الملصوق. تأكد أنك صدّرت الكوكيز من صفحة المنصة نفسها (وليس من موقع آخر).');
    }
    const failures = [];
    let imported = 0;
    for (const cookie of valid) {
      try {
        await context.addCookies([cookie]);
        imported += 1;
      } catch (error) {
        failures.push(`${cookie.name}: ${String((error && error.message) || error).slice(0, 100)}`);
      }
    }
    if (!imported) {
      throw new Error(`رفض متصفح السيرفر كل الكوكيز (${cookies.length}) — سبب أول رفض: ${failures[0] || 'Invalid cookie fields'}. أعد التصدير من Cookie-Editor بصيغة JSON وأنت على صفحة المنصة.`);
    }

    let ok = false;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      await page.goto(config.homeUrl, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
      await page.waitForTimeout(2500);
      if (hasSessionCookies(platform, await context.cookies())) { ok = true; break; }
    }
    if (!ok) {
      await saveLoginDebug(platform, page, 'cookie-import-unauth');
      throw new Error('الكوكيز المستوردة لم تُنشئ جلسة دخول. افتح صفحة المنصة في متصفحك وتأكد أنك ترى حسابك مسجّلاً، ثم اضغط Export في Cookie-Editor من جديد والصق النص فوراً (لا تُسجّل الخروج بعد النسخ).');
    }
    return finishLogin(platform, context, '');
  } finally {
    await page.close().catch(() => {});
  }
}

/**
 * Re-check a stored profile the lenient, proven way: open the home page so the
 * jar refreshes, then apply the same session-cookie presence rule login uses.
 * It never downgrades a profile whose browser could not be reached.
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
    const ok = hasSessionCookies(platform, cookies);
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
  normalizePlaywrightCookie,
  hasSessionCookies,
  submitVerification,
  verificationState,
  cancelVerification,
  captureDebug,
};
