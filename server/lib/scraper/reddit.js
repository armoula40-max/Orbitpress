'use strict';
/**
 * reddit.js — public subreddit scanning via Reddit's anonymous JSON listings.
 * Works over plain HTTP, no login required for public communities.
 */
const { requestJson } = require('../http');
const analyzer = require('./analyzer');

const DEFAULT_BASE = 'https://www.reddit.com';

function parseSubreddit(url) {
  let parsed;
  try {
    parsed = new URL(String(url || '').trim());
  } catch {
    throw new Error('Enter a valid https://www.reddit.com/r/... URL.');
  }
  const host = parsed.hostname.toLowerCase();
  if (!(host === 'reddit.com' || host.endsWith('.reddit.com'))) {
    throw new Error('Only public Reddit HTTPS URLs are supported.');
  }
  const match = parsed.pathname.match(/\/r\/([\w-]+)/);
  if (!match) throw new Error('Enter a subreddit URL like https://www.reddit.com/r/recipes/.');
  const sort = /\/(hot|new|top|rising|best)\b/.test(parsed.pathname) ? parsed.pathname.match(/\/(hot|new|top|rising|best)\b/)[1] : 'hot';
  return { subreddit: match[1], sort, isPost: /\/comments\//.test(parsed.pathname) };
}

async function scanReddit({ url, maxPosts = 20, baseUrl }) {
  const base = (baseUrl || DEFAULT_BASE).replace(/\/+$/, '');
  const info = parseSubreddit(url);
  const limit = Math.min(100, Math.max(1, Number(maxPosts) || 20));
  const listing = await requestJson(
    info.isPost
      ? `${base}/r/${info.subreddit}/hot.json?limit=${limit}&raw_json=1`
      : `${base}/r/${info.subreddit}/${info.sort}.json?limit=${limit}&raw_json=1`,
    'GET',
    { 'User-Agent': 'OrbitPress/4.0 social-research', Accept: 'application/json' },
    null,
    { timeoutMs: 30000, allowHttp: base.startsWith('http://') },
  );
  const children = listing && listing.data && Array.isArray(listing.data.children) ? listing.data.children : [];
  const posts = children.slice(0, limit).map((child) => {
    const d = child.data || {};
    return {
      id: d.id,
      platform: 'reddit',
      kind: 'reddit_post',
      title: String(d.title || '').slice(0, 300),
      text: String(d.selftext || '').slice(0, 2200),
      url: d.permalink ? `https://www.reddit.com${d.permalink}` : (d.url || null),
      publishedAt: d.created_utc ? new Date(d.created_utc * 1000).toISOString() : null,
      reactions: Number.isFinite(Number(d.ups)) ? Number(d.ups) : null,
      comments: Number.isFinite(Number(d.num_comments)) ? Number(d.num_comments) : null,
      shares: null,
      saves: null,
      author: d.author || null,
      flair: d.link_flair_text || null,
      viralScore: null,
    };
  });
  const ranked = analyzer.rankPosts(posts);
  return {
    ok: true,
    platform: 'reddit',
    source: `r/${info.subreddit} · ${info.sort}`,
    sourceUrl: url,
    collectionMethod: 'reddit_public_json',
    completeness: ranked.length >= limit ? 'full' : 'partial',
    posts: ranked,
    stats: analyzer.computeStats(ranked),
  };
}

module.exports = { scanReddit, parseSubreddit };
