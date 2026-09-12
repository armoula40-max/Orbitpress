'use strict';
/**
 * socialapi.js — official/social API operations retained from the Android app:
 *  - facebookGraphScan (Graph API with a saved Page token)
 *  - pinterestApiScan (Pinterest API v5 with the saved OAuth token)
 *  - scraperScan (the legacy external "VPS scraper" passthrough, kept so older
 *    settings keep working — the new built-in scraper does not need it)
 */
const { requestJson } = require('./http');
const { getSiteSettings } = require('./store');
const analyzer = require('./scraper/analyzer');

function facebookGraphUrl(version, path, query = {}) {
  const safeVersion = String(version || '').trim().replace(/^\//, '') || 'v23.0';
  const safePath = String(path || '').trim().replace(/^\/+|\/+$/g, '');
  const encoded = new URLSearchParams(query).toString();
  return `https://graph.facebook.com/${safeVersion}/${safePath}` + (encoded ? `?${encoded}` : '');
}

async function facebookGraphScan(request) {
  const settings = getSiteSettings(request.siteId || 'site-default');
  const token = String(settings.facebookAccessToken || '').trim();
  if (!token) throw new Error('Configure a Facebook access token before using Graph API.');
  const type = String(request.sourceType || 'page').toLowerCase();
  if (type !== 'page') throw new Error('Facebook Groups Graph API is not available in the current supported API versions.');
  const pageId = String(request.pageId || '').trim();
  if (!pageId || !/^\d+$/.test(pageId)) throw new Error('Provide a numeric Facebook Page ID.');
  const version = String(settings.facebookGraphVersion || '').trim() || 'v23.0';
  const page = await requestJson(facebookGraphUrl(version, pageId, {
    fields: 'id,name,username,about,category,followers_count,fan_count,link,picture.type(large)',
  }), 'GET', { Authorization: `Bearer ${token}` });
  const limit = Math.min(100, Math.max(1, Number(request.limit) || 25));
  const feed = await requestJson(facebookGraphUrl(version, `${pageId}/feed`, {
    fields: 'id,message,story,created_time,permalink_url,shares,comments.limit(0).summary(true),reactions.limit(0).summary(true)',
    limit: String(limit),
  }), 'GET', { Authorization: `Bearer ${token}` });
  const posts = (Array.isArray(feed.data) ? feed.data : []).map((raw) => ({
    id: raw.id,
    platform: 'facebook',
    kind: 'facebook_post',
    title: String(raw.story || '').trim() || String(raw.message || '').split('\n')[0],
    text: String(raw.message || ''),
    publishedAt: raw.created_time || null,
    url: raw.permalink_url || null,
    reactions: raw.reactions && raw.reactions.summary ? raw.reactions.summary.total_count : null,
    comments: raw.comments && raw.comments.summary ? raw.comments.summary.total_count : null,
    shares: raw.shares && raw.shares.count != null ? raw.shares.count : null,
    saves: null,
    viralScore: null,
  }));
  const ranked = analyzer.rankPosts(posts);
  return {
    ok: true,
    platform: 'facebook',
    sourceType: 'page',
    source: {
      id: page.id,
      name: page.name,
      username: page.username,
      about: page.about,
      category: page.category,
      followers: page.followers_count != null ? page.followers_count : page.fan_count,
      link: page.link,
      picture: page.picture && page.picture.data && page.picture.data.url,
    },
    posts: ranked,
    paging: feed.paging || {},
    stats: analyzer.computeStats(ranked),
    collectionMethod: 'facebook_graph_api',
  };
}

function pinterestApiUrl(path, query = {}) {
  const encoded = new URLSearchParams(query).toString();
  return `https://api.pinterest.com/v5/${String(path || '').replace(/^\/+/, '')}` + (encoded ? `?${encoded}` : '');
}

async function pinterestApiScan(request) {
  const settings = getSiteSettings(request.siteId || 'site-default');
  const token = String(settings.pinterestAccessToken || '').trim();
  if (!token) throw new Error('Configure a Pinterest access token before using Pinterest API.');
  const boardId = String(request.boardId || '').trim() || String(settings.pinterestBoardId || '').trim();
  if (!boardId) throw new Error('Select a Pinterest Board ID before using the API scan.');
  const headers = { Authorization: `Bearer ${token}` };
  const account = await requestJson(pinterestApiUrl('user_account'), 'GET', headers);
  const pageSize = Math.min(250, Math.max(1, Number(request.pageSize) || 50));
  const pinsResponse = await requestJson(pinterestApiUrl(`boards/${boardId}/pins`, { page_size: String(pageSize) }), 'GET', headers);
  const rawPins = pinsResponse.items || pinsResponse.data || [];
  const pins = rawPins.map((raw) => ({
    id: raw.id,
    platform: 'pinterest',
    kind: 'pinterest_pin',
    title: String(raw.title || ''),
    text: String(raw.description || ''),
    publishedAt: raw.created_at || null,
    url: raw.link || (raw.id ? `https://www.pinterest.com/pin/${raw.id}/` : null),
    imageUrl: raw.media && raw.media.images && raw.media.images.orig && raw.media.images.orig.url ? raw.media.images.orig.url : null,
    saves: raw.save_count != null ? raw.save_count : null,
    comments: raw.comment_count != null ? raw.comment_count : null,
    viralScore: null,
  }));
  let analytics = [];
  if (request.includeAnalytics !== false) {
    const end = new Date();
    const start = new Date(end.getTime() - Math.min(90, Math.max(1, Number(request.days) || 30)) * 24 * 3600 * 1000);
    try {
      const top = await requestJson(pinterestApiUrl('user_account/analytics/top_pins', {
        start_date: start.toISOString().slice(0, 10),
        end_date: end.toISOString().slice(0, 10),
        sort_by: String(request.sortBy || 'ENGAGEMENT').toUpperCase(),
        num_of_pins: String(Math.min(50, Math.max(1, Number(request.topPins) || 50))),
      }), 'GET', headers);
      analytics = (top.pins || []).map((item) => ({ id: item.pin_id, metrics: item.metrics || {}, dataStatus: item.data_status || {} }));
    } catch { /* analytics scope may be unavailable — keep pins */ }
  }
  const ranked = analyzer.rankPosts(pins);
  return {
    ok: true,
    platform: 'pinterest',
    source: account,
    boardId,
    posts: ranked,
    analytics,
    paging: pinsResponse.bookmark || {},
    stats: analyzer.computeStats(ranked),
    collectionMethod: 'pinterest_api_v5',
  };
}

/** Legacy external VPS-scraper passthrough (kept for backward compatibility). */
async function scraperScan(request, platform) {
  const settings = getSiteSettings(request.siteId || 'site-default');
  const base = String(settings.scraperApiBaseUrl || '').trim().replace(/\/+$/, '');
  const key = String(settings.scraperApiKey || '').trim();
  if (!base || !key) throw new Error('Configure the VPS Scraper API URL and key first.');
  if (!base.startsWith('https://')) throw new Error('Scraper API URL must use HTTPS.');
  const url = String(request.url || '').trim();
  if (!url.startsWith('https://')) throw new Error('Only HTTPS social URLs are accepted.');
  const limit = Math.min(200, Math.max(1, Number(request.limit) || 20));
  // Unlike the Android app, the server has no WebView cookie jar — pass empty
  // cookies; the built-in scraper (/api/scraper/jobs) is the recommended path.
  const body = {
    url,
    [platform === 'facebook' ? 'maxPosts' : 'maxItems']: limit,
    cookies: [],
  };
  return requestJson(`${base}/api/${platform}/scrape`, 'POST', {
    'x-orbitpress-key': key,
  }, body);
}

module.exports = { facebookGraphScan, pinterestApiScan, scraperScan, facebookGraphUrl, pinterestApiUrl };
