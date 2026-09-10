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

test('isAuthenticated enforces the real platform markers', () => {
  // Pinterest keeps _pinterest_sess for guests: _auth=1 is the real marker.
  assert.equal(sessions.isAuthenticated('pinterest', [{ name: '_pinterest_sess', value: 'guest' }]), false);
  assert.equal(sessions.isAuthenticated('pinterest', [{ name: '_pinterest_sess', value: 'x' }, { name: '_auth', value: '0' }]), false);
  assert.equal(sessions.isAuthenticated('pinterest', [{ name: '_pinterest_sess', value: 'x' }, { name: '_auth', value: '1' }]), true);
  // Facebook needs both identity cookies.
  assert.equal(sessions.isAuthenticated('facebook', [{ name: 'c_user', value: '42' }]), false);
  assert.equal(sessions.isAuthenticated('facebook', [{ name: 'c_user', value: '42' }, { name: 'xs', value: 'tok' }]), true);
});
