'use strict';
/**
 * scraper/index.js — unified scanner facade + in-process job registry.
 *
 * Scans run as async jobs so the UI can poll progress without sockets:
 *   POST /api/scraper/jobs   -> { jobId }
 *   GET  /api/scraper/jobs/:id -> { status, progress, result? | error? }
 */
const crypto = require('crypto');
const { scanPinterest } = require('./pinterest');
const { scanFacebook } = require('./facebook');
const { scanReddit } = require('./reddit');
const sessions = require('./sessions');
const analyzer = require('./analyzer');

const JOB_TTL_MS = 30 * 60 * 1000;
const jobs = new Map(); // jobId -> {status, platform, progress, message, result, error, createdAt}

setInterval(() => {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (now - job.createdAt > JOB_TTL_MS) jobs.delete(id);
  }
}, 5 * 60 * 1000).unref();

function getJob(id) {
  return jobs.get(String(id || '')) || null;
}

function startScanJob(payload) {
  const platform = String(payload.platform || '').toLowerCase();
  if (!['facebook', 'pinterest', 'reddit'].includes(platform)) {
    throw new Error('Unsupported social platform.');
  }
  const jobId = crypto.randomUUID();
  const job = {
    id: jobId,
    platform,
    status: 'running',
    progress: 5,
    message: 'Starting the built-in server scanner…',
    createdAt: Date.now(),
    result: null,
    error: null,
  };
  jobs.set(jobId, job);
  const runner = platform === 'facebook'
    ? scanFacebook({
        url: payload.url,
        maxPosts: payload.maxPosts || payload.limit || 25,
        scrolls: payload.scrolls || 6,
        useSession: payload.useSession !== false,
        baseUrl: payload.baseUrl,
      })
    : platform === 'reddit'
      ? scanReddit({ url: payload.url, maxPosts: payload.maxPosts || 20, baseUrl: payload.baseUrl })
      : scanPinterest({
          url: payload.url,
          query: payload.query,
          maxItems: payload.maxPins || payload.maxItems || payload.limit || 20,
          scrolls: payload.scrolls || 6,
          useSession: payload.useSession !== false,
          baseUrl: payload.baseUrl,
        });
  job.progress = 25;
  job.message = 'Fetching page data (fast channel first)…';
  runner
    .then((result) => {
      job.status = 'done';
      job.progress = 100;
      job.message = `Collected ${result.posts.length} ${platform === 'pinterest' ? 'pins' : 'posts'} via ${result.collectionMethod}.`;
      job.result = result;
    })
    .catch((error) => {
      job.status = 'error';
      job.progress = 100;
      job.error = { message: error.message || 'Scan failed.' };
      job.message = job.error.message;
    });
  return job;
}

/** FeedSpy re-query endpoint: filters/sorts the cached posts of a finished job. */
function queryJobPosts(jobId, options) {
  const job = getJob(jobId);
  if (!job || job.status !== 'done' || !job.result) return null;
  const { posts, stats } = analyzer.applyAll(job.result.posts, {
    period: options.period,
    query: options.query,
    filter: options.filter,
    sort: options.sort,
  });
  return { posts, stats, platform: job.platform, source: job.result.source, collectionMethod: job.result.collectionMethod };
}

module.exports = {
  startScanJob,
  getJob,
  queryJobPosts,
  scanPinterest,
  scanFacebook,
  scanReddit,
  sessions,
  analyzer,
};
