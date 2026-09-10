'use strict';
process.env.ORBITPRESS_ALLOW_HTTP = '1';
process.env.ORBITPRESS_DATA_DIR = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'orbitpress-cookies-'));

const test = require('node:test');
const assert = require('node:assert');
const sessions = require('../lib/scraper/sessions');

test('parseCookieImport reads a Cookie-Editor JSON export', () => {
  const exported = [
    { name: '_auth', value: '1', domain: '.pinterest.com', path: '/', secure: true, httpOnly: false, sameSite: 'no_restriction', expirationDate: 1893456000.1 },
    { name: '_pinterest_sess', value: 'abc%3D', domain: '.pinterest.com', path: '/', secure: true, httpOnly: true, sameSite: 'lax', expirationDate: 1893456000 },
    { name: 'csrftoken', value: 'tok', domain: '.pinterest.com', path: '/', secure: false, httpOnly: false, sameSite: 'unspecified' },
  ];
  const parsed = sessions.parseCookieImport('pinterest', JSON.stringify(exported));
  assert.equal(parsed.length, 3);
  const auth = parsed.find((c) => c.name === '_auth');
  assert.equal(auth.value, '1');
  assert.equal(auth.expires, 1893456000, 'expirationDate becomes an integer unix timestamp');
  assert.equal(auth.sameSite, 'None', 'no_restriction maps to SameSite=None');
  assert.equal(auth.secure, true, 'SameSite=None forces secure');
  const csrf = parsed.find((c) => c.name === 'csrftoken');
  assert.equal(csrf.sameSite, 'Lax', 'unspecified defaults to Lax');
  assert.equal(csrf.secure, false);
});

test('parseCookieImport reads Netscape cookies.txt including #HttpOnly_ lines', () => {
  const netscape = [
    '# Netscape HTTP Cookie File',
    '.pinterest.com\tTRUE\t/\tTRUE\t1893456000\t_auth\t1',
    '#HttpOnly_.pinterest.com\tTRUE\t/\tTRUE\t1893456000\t_pinterest_sess\tsessionvalue',
    '',
  ].join('\n');
  const parsed = sessions.parseCookieImport('pinterest', netscape);
  assert.equal(parsed.length, 2);
  const session = parsed.find((c) => c.name === '_pinterest_sess');
  assert.equal(session.value, 'sessionvalue');
  assert.equal(session.httpOnly, true);
  assert.equal(session.secure, true);
  assert.equal(session.expires, 1893456000);
  assert.equal(parsed.find((c) => c.name === '_auth').httpOnly, false);
});

test('parseCookieImport reads a raw Cookie header paste', () => {
  const parsed = sessions.parseCookieImport('pinterest', '_auth=1; _pinterest_sess=abc; csrftoken=tok; ');
  assert.equal(parsed.length, 3);
  assert.deepEqual(parsed.map((c) => c.name).sort(), ['_auth', '_pinterest_sess', 'csrftoken']);
  for (const cookie of parsed) {
    assert.equal(cookie.domain, '.pinterest.com');
    assert.equal(cookie.path, '/');
    assert.equal(cookie.secure, true);
    assert.equal(cookie.expires, undefined, 'header paste yields session cookies');
  }
});

test('parseCookieImport rejects empty or unrecognizable input', () => {
  assert.throws(() => sessions.parseCookieImport('pinterest', ''), /الصق/);
  assert.throws(() => sessions.parseCookieImport('pinterest', '{not json'), /JSON/);
  assert.throws(() => sessions.parseCookieImport('pinterest', JSON.stringify({ cookies: [] })), /كوكيز/);
});

test('normalized cookies satisfy CDP rules (__Host- uses url, past expiry dropped, invalid domain repaired)', () => {
  const normalize = (cookie) => sessions.normalizePlaywrightCookie
    ? sessions.normalizePlaywrightCookie(cookie, 'pinterest')
    : null;
  // __Host- prefix: no Domain attribute, path /, secure — expressed via url
  const host = normalize({ name: '__Host-next-auth', value: 'v', domain: '.pinterest.com', path: '/foo', secure: false, sameSite: 'lax' });
  assert.equal(host.url, 'https://www.pinterest.com/', '__Host- cookie is bound to an origin URL');
  assert.equal(host.domain, undefined);
  assert.equal(host.path, undefined);
  assert.equal(host.secure, true);
  // __Secure- prefix forces secure but keeps the domain
  const sec = normalize({ name: '__Secure-token', value: 'v', domain: '.pinterest.com', path: '/', secure: false, sameSite: 'Lax' });
  assert.equal(sec.secure, true);
  assert.equal(sec.domain, '.pinterest.com');
  // past expiry is dropped (CDP rejects/expires it; make it a session cookie)
  const expired = normalize({ name: 'old', value: 'v', domain: '.pinterest.com', path: '/', expires: 1000000 });
  assert.equal(expired.expires, undefined);
  // future expiry stays as an integer
  const future = normalize({ name: 'fresh', value: 'v', domain: '.pinterest.com', path: '/', expires: 1893456000.9 });
  assert.equal(future.expires, 1893456000);
  // garbage/empty domain falls back to the platform root
  const badDomain = normalize({ name: 'x', value: 'v', domain: 'not a domain!!', path: 'nopath', secure: true });
  assert.equal(badDomain.domain, '.pinterest.com');
  assert.equal(badDomain.path, '/');
  // sameSite None forces secure
  const none = normalize({ name: 'n', value: 'v', domain: '.pinterest.com', path: '/', secure: false, sameSite: 'no_restriction' });
  assert.equal(none.sameSite, 'None');
  assert.equal(none.secure, true);
  // illegal cookie names are rejected rather than failing the whole CDP batch
  assert.equal(normalize({ name: 'bad;name', value: 'v', domain: '.pinterest.com' }), null);
  assert.equal(normalize({ name: '', value: 'v', domain: '.pinterest.com' }), null);
});

test('a JSON export containing __Host-, expired and third-party cookies still yields a usable Pinterest set', () => {
  const exported = [
    { name: '__Host-spi', value: 'h', domain: 'www.pinterest.com', path: '/', secure: true, httpOnly: true, sameSite: 'lax' },
    { name: 'stale', value: 'x', domain: '.pinterest.com', path: '/', secure: true, expirationDate: 1 },
    { name: '_pinterest_sess', value: 'sess', domain: '.pinterest.com', path: '/', secure: true, httpOnly: true, sameSite: 'lax', expirationDate: 1893456000 },
    { name: 'foreign', value: 'f', domain: '.example.com', path: '/', secure: true },
  ];
  const parsed = sessions.parseCookieImport('pinterest', JSON.stringify(exported));
  assert.equal(parsed.length, 4, 'the parser keeps everything structurally valid');
  assert.ok(parsed.find((c) => c.name === '__Host-spi' && c.url && !c.domain));
  assert.ok(parsed.find((c) => c.name === '_pinterest_sess' && c.expires === 1893456000));
  // the import-time filter keeps host-URL cookies AND domain cookies, drops other domains
  const belongs = (c) => (c.url && c.url.includes('pinterest.')) || (c.domain && c.domain.includes('pinterest.'));
  assert.equal(parsed.filter(belongs).length, 3);
});

test('hasSessionCookies uses the same lenient presence rule the working login used', () => {
  // Pinterest: a stored profile carries _pinterest_sess only after a real
  // login; the optional _auth cookie must not be required.
  assert.equal(sessions.hasSessionCookies('pinterest', [{ name: '_pinterest_sess', value: 'guest' }]), true);
  assert.equal(sessions.hasSessionCookies('pinterest', [{ name: '_pinterest_sess', value: 'x' }, { name: '_auth', value: '1' }]), true);
  assert.equal(sessions.hasSessionCookies('pinterest', [{ name: 'csrftoken', value: 't' }]), false);
  // Facebook: c_user or xs marks the session
  assert.equal(sessions.hasSessionCookies('facebook', [{ name: 'c_user', value: '42' }]), true);
  assert.equal(sessions.hasSessionCookies('facebook', [{ name: 'xs', value: 'tok' }]), true);
  assert.equal(sessions.hasSessionCookies('facebook', [{ name: 'datr', value: 'x' }]), false);
});;
