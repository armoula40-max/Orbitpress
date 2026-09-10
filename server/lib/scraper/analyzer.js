'use strict';
/**
 * analyzer.js — FeedSpy-style analytics over normalized posts.
 *
 * Normalized post shape:
 *   { id, platform, title, text, url, imageUrl?, publishedAt,
 *     reactions?, comments?, shares?, saves?, viralScore, kind }
 */
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Single engagement figure, weighted like FeedSpy "efficiency": shares/saves weigh more than passive reactions. */
function engagementOf(post) {
  const reactions = num(post.reactions) || 0;
  const comments = num(post.comments) || 0;
  const shares = num(post.shares) || 0;
  const saves = num(post.saves) || 0;
  return reactions + saves * 2 + comments * 2 + shares * 3;
}

/**
 * Assigns a 0–100 viral score relative to the strongest post in the same batch.
 * Relative scoring only means something when the batch actually contains a
 * signal: if even the best post has almost no engagement, every post would
 * otherwise score 100 and the report would advertise "viral" content that is
 * simply quiet. Below VIRAL_MIN_SIGNAL the whole batch scores 0 and the raw
 * counters stay visible instead.
 */
const VIRAL_MIN_SIGNAL = 5;

function rankPosts(posts) {
  const engagements = posts.map(engagementOf);
  const max = Math.max(1, ...engagements);
  const hasSignal = max >= VIRAL_MIN_SIGNAL;
  return posts.map((post, index) => ({
    ...post,
    engagement: engagements[index],
    viralScore: hasSignal ? Math.round((engagements[index] / max) * 1000) / 10 : 0,
  }));
}

function parseDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** FeedSpy period filter: Window in days (7/30/90) or a custom [start,end] ISO range. */
function filterPeriod(posts, period) {
  const p = period || {};
  let start = null;
  let end = null;
  if (p.start) start = parseDate(p.start);
  if (p.end) {
    end = parseDate(p.end);
    if (end && /^\d{4}-\d{2}-\d{2}$/.test(String(p.end))) end = new Date(end.getTime() + 24 * 3600 * 1000 - 1);
  }
  if (!start && p.days && p.days !== 'all') {
    const days = Math.min(3650, Math.max(1, Number(p.days) || 30));
    start = new Date(Date.now() - days * 24 * 3600 * 1000);
  }
  if (!start && !end) return posts;
  return posts.filter((post) => {
    const date = parseDate(post.publishedAt);
    if (!date) return false; // FeedSpy behaviour: undated rows drop out of period filters
    if (start && date < start) return false;
    if (end && date > end) return false;
    return true;
  });
}

function filterQuery(posts, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return posts;
  return posts.filter((post) => (String(post.title || '') + ' ' + String(post.text || '')).toLowerCase().includes(q));
}

/** FeedSpy min/max metric filters: metric is likes|comments|shares|saves|viralScore. */
function filterMinMax(posts, filters) {
  const { metric, min, max } = filters || {};
  if (!metric) return posts;
  const lo = min != null && min !== '' ? Number(min) : null;
  const hi = max != null && max !== '' ? Number(max) : null;
  if (lo == null && hi == null) return posts;
  const getter = (post) => {
    if (metric === 'viralScore') return num(post.viralScore);
    return num(post[metric]);
  };
  return posts.filter((post) => {
    const value = getter(post);
    if (value == null) return false;
    if (lo != null && value < lo) return false;
    if (hi != null && value > hi) return false;
    return true;
  });
}

const SORTS = {
  viral: (a, b) => (num(b.viralScore) || 0) - (num(a.viralScore) || 0),
  likes: (a, b) => (num(b.reactions) || 0) - (num(a.reactions) || 0),
  saves: (a, b) => (num(b.saves) || 0) - (num(a.saves) || 0),
  comments: (a, b) => (num(b.comments) || 0) - (num(a.comments) || 0),
  shares: (a, b) => (num(b.shares) || 0) - (num(a.shares) || 0),
  newest: (a, b) => (parseDate(b.publishedAt) || 0) - (parseDate(a.publishedAt) || 0),
  oldest: (a, b) => (parseDate(a.publishedAt) || 2147483647000) - (parseDate(b.publishedAt) || 2147483647000),
};

function sortPosts(posts, sortKey) {
  const comparator = SORTS[String(sortKey || '')] || SORTS.viral;
  return [...posts].sort(comparator);
}

/** Aggregates FeedSpy-style stats: totals, activity by weekday, best posting slots. */
function computeStats(posts) {
  const dated = posts.map((post) => ({ post, date: parseDate(post.publishedAt) })).filter((entry) => entry.date);
  const totalEngagement = posts.reduce((sum, post) => sum + engagementOf(post), 0);
  const withMetrics = posts.filter((post) => num(post.reactions) != null || num(post.comments) != null || num(post.saves) != null || num(post.shares) != null).length;

  const byDay = new Map(); // yyyy-mm-dd -> {count, engagement}
  const byWeekdayHour = new Map(); // `${weekday}-${hour}` -> {weekday,hour,count,engagement}
  dated.forEach(({ post, date }) => {
    const dayKey = date.toISOString().slice(0, 10);
    const day = byDay.get(dayKey) || { date: dayKey, count: 0, engagement: 0 };
    day.count += 1;
    day.engagement += engagementOf(post);
    byDay.set(dayKey, day);
    const slotKey = `${date.getUTCDay()}-${date.getUTCHours()}`;
    const slot = byWeekdayHour.get(slotKey) || { weekday: date.getUTCDay(), weekdayName: WEEKDAYS[date.getUTCDay()], hour: date.getUTCHours(), count: 0, engagement: 0 };
    slot.count += 1;
    slot.engagement += engagementOf(post);
    byWeekdayHour.set(slotKey, slot);
  });

  const slots = [...byWeekdayHour.values()]
    .map((slot) => ({ ...slot, avgEngagement: Math.round((slot.engagement / slot.count) * 10) / 10 }))
    .sort((a, b) => b.avgEngagement - a.avgEngagement);
  const byWeekday = [...Array(7).keys()].map((weekday) => {
    const rows = slots.filter((slot) => slot.weekday === weekday);
    return {
      weekday,
      weekdayName: WEEKDAYS[weekday],
      count: rows.reduce((sum, slot) => sum + slot.count, 0),
      engagement: rows.reduce((sum, slot) => sum + slot.engagement, 0),
    };
  });

  return {
    count: posts.length,
    datedCount: dated.length,
    withMetricsCount: withMetrics,
    totalEngagement,
    avgEngagement: posts.length ? Math.round((totalEngagement / posts.length) * 10) / 10 : 0,
    topViralScore: posts.length ? Math.max(...posts.map((post) => num(post.viralScore) || 0)) : 0,
    activityByDay: [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)),
    byWeekday,
    bestSlots: slots.slice(0, 5),
  };
}

function applyAll(posts, options) {
  const ranked = rankPosts(posts);
  const periodFiltered = filterPeriod(ranked, options.period);
  const queryFiltered = filterQuery(periodFiltered, options.query);
  const minMaxFiltered = filterMinMax(queryFiltered, options.filter);
  const sorted = sortPosts(minMaxFiltered, options.sort);
  return { posts: sorted, stats: computeStats(sorted) };
}

function csvEscape(value) {
  const text = value == null ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(posts) {
  const header = ['title', 'publishedAt', 'reactions', 'comments', 'shares', 'saves', 'engagement', 'viralScore', 'url'];
  const rows = posts.map((post) => [
    post.title || (post.text || '').slice(0, 120),
    post.publishedAt || '',
    post.reactions ?? '',
    post.comments ?? '',
    post.shares ?? '',
    post.saves ?? '',
    post.engagement ?? engagementOf(post),
    post.viralScore ?? '',
    post.url || '',
  ].map(csvEscape).join(','));
  return [header.join(','), ...rows].join('\r\n');
}

module.exports = {
  engagementOf,
  rankPosts,
  filterPeriod,
  filterQuery,
  filterMinMax,
  sortPosts,
  computeStats,
  applyAll,
  toCsv,
};
