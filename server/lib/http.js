'use strict';
/**
 * http.js — strict outbound HTTP layer that mirrors the Android Kotlin http():
 *  - 25s connect / 90s read budget (single timeout enforced via AbortSignal)
 *  - manual redirect handling: at most 4 hops, HTTPS-only, 301/302 on non-GET
 *    requests is rejected (prevents silently losing a POST body)
 *  - throws Error("Request failed (<status>): <280 chars>") like Android
 */
const ALLOW_INSECURE_HTTP = process.env.ORBITPRESS_ALLOW_HTTP === '1';

async function request(url, method, headers = {}, bodyBytes = null, options = {}) {
  let currentUrl = String(url);
  let currentMethod = (method || 'GET').toUpperCase();
  let currentBody = bodyBytes;
  const maxHops = options.maxHops != null ? options.maxHops : 4;
  const timeoutMs = options.timeoutMs || 90000;

  for (let hop = 0; hop < maxHops; hop += 1) {
    const allowHttp = ALLOW_INSECURE_HTTP || options.allowHttp === true;
    if (!currentUrl.startsWith('https://') && !(allowHttp && currentUrl.startsWith('http://'))) {
      throw new Error('Request blocked: only HTTPS URLs are allowed.');
    }
    const response = await fetch(currentUrl, {
      method: currentMethod,
      headers: Object.fromEntries(Object.entries(headers || {}).filter(([, v]) => v != null)),
      body: currentBody == null ? undefined : currentBody,
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });
    const status = response.status;
    if (status >= 300 && status < 400) {
      const location = (response.headers.get('location') || '').trim();
      if (!location) throw new Error(`Request failed (${status}): redirect without Location`);
      const next = new URL(location, currentUrl).toString();
      const nextAllowed = next.startsWith('https://') || (ALLOW_INSECURE_HTTP || options.allowHttp === true) && next.startsWith('http://');
      if (!nextAllowed) throw new Error('Request redirected to a non-HTTPS URL.');
      if ((status === 301 || status === 302) && currentMethod !== 'GET' && currentMethod !== 'HEAD') {
        throw new Error(`Request failed (${status}): WordPress redirected a ${currentMethod} request to ${next}. Use the canonical HTTPS site URL.`);
      }
      currentUrl = next;
      if (status === 301 || status === 302) { currentMethod = 'GET'; currentBody = null; }
      if (hop === maxHops - 1) throw new Error(`Request failed (${status}): too many redirects; last Location=${next}`);
      continue;
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (status < 200 || status > 299) {
      const snippet = buffer.toString('utf8').slice(0, 280);
      const error = new Error(`Request failed (${status}): ${snippet}`);
      error.status = status;
      error.body = snippet;
      throw error;
    }
    return buffer;
  }
  throw new Error('Request failed: too many redirects');
}

async function requestText(url, method, headers, bodyBytes, options) {
  return (await request(url, method, headers, bodyBytes, options)).toString('utf8');
}

async function requestJson(url, method, headers, body, options) {
  const payload = body == null ? null : Buffer.from(JSON.stringify(body), 'utf8');
  const mergedHeaders = body == null ? headers : { ...(headers || {}), 'Content-Type': 'application/json' };
  const text = await requestText(url, method, mergedHeaders, payload, options);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Request failed: expected JSON but received ${text.slice(0, 160)}`);
  }
}

module.exports = { request, requestText, requestJson };
