'use strict';
/**
 * scheduler.js — durable server-side draft-preparation runner.
 *
 * The Android app only persisted the plan ("manual only, WorkManager boundary").
 * On a server we can actually run it: when workspace.plan.scheduleEnabled is
 * on, the runner generates up to `dailyCount` keyword drafts per site per day
 * starting at `firstHour` (UTC). Publishing stays strictly manual — the runner
 * only prepares drafts, exactly like the app's stated contract.
 */
const { loadWorkspace, saveWorkspace, loadNamedStore, saveNamedStore } = require('./store');
const article = require('./article');
const { ScheduleContract } = require('./contracts');

const TICK_MS = 60 * 1000;
const stateName = 'scheduler-state';

function loadState() {
  return loadNamedStore(stateName, { days: {}, runs: [] });
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function logRun(entry) {
  const state = loadState();
  state.runs.unshift({ at: new Date().toISOString(), ...entry });
  state.runs = state.runs.slice(0, 200);
  saveNamedStore(stateName, state);
}

function queueForSite(workspace, siteId) {
  return (workspace.keywords || []).filter((item) => (!item.siteId || item.siteId === siteId) && String(item.status || 'queued') === 'queued');
}

async function runOnceForSite(workspace, siteId, plan) {
  const state = loadState();
  const day = state.days[`${siteId}:${todayKey()}`] || { generated: 0 };
  const remaining = Math.max(0, Number(plan.dailyCount) - day.generated);
  if (!remaining) return;
  const queue = queueForSite(workspace, siteId).slice(0, remaining);
  for (const item of queue) {
    try {
      const drafts = (workspace.drafts || []).filter((d) => d.generationStatus === 'published');
      const existingTitles = drafts.map((d) => d.title).slice(-40).join(' | ');
      const category = (workspace.categories || []).find((c) => String(c.id) === String(item.categoryId) && (!c.siteId || c.siteId === siteId));
      const result = await article.generate({
        keyword: item.keyword,
        niche: item.niche || 'food',
        contentType: item.contentType || 'auto',
        categoryName: item.categoryName || (category && category.name) || '',
        existingTitles,
        keywords: queue.map((q) => q.keyword),
        siteId,
      });
      item.status = 'generated';
      const draft = { ...result.draft, keyword: item.keyword, niche: item.niche || 'food', siteId, scheduled: true };
      draft.generationStatus = 'ready';
      workspace.drafts.unshift(draft);
      day.generated += 1;
      logRun({ siteId, keyword: item.keyword, ok: true, draftId: draft.id });
    } catch (error) {
      item.status = 'failed';
      item.error = String(error.message || 'generation failed').slice(0, 300);
      logRun({ siteId, keyword: item.keyword, ok: false, error: item.error });
    }
    state.days[`${siteId}:${todayKey()}`] = day;
    saveNamedStore(stateName, state);
    saveWorkspace(workspace);
  }
}

let timer = null;

function sweepWorkspace() {
  // prune per-day counters older than 3 days
  const state = loadState();
  const keys = Object.keys(state.days);
  const cutoff = Date.now() - 3 * 24 * 3600 * 1000;
  let changed = false;
  for (const key of keys) {
    const dayPart = key.slice(key.lastIndexOf(':') + 1);
    if (Date.parse(dayPart) < cutoff) { delete state.days[key]; changed = true; }
  }
  if (changed) saveNamedStore(stateName, state);
}

async function tick() {
  try {
    sweepWorkspace();
    const workspace = loadWorkspace();
    const plan = workspace.plan || {};
    if (!plan.scheduleEnabled) return;
    const hour = Number(plan.firstHour);
    const now = new Date();
    if (!(Number.isInteger(hour) && hour >= 0 && hour <= 23)) return;
    if (now.getUTCHours() < hour) return;
    const siteIds = [...new Set((workspace.siteProfiles || [{ id: 'site-default' }]).map((p) => p.id))];
    for (const siteId of siteIds) {
      await runOnceForSite(workspace, siteId, plan);
    }
  } catch (error) {
    logRun({ ok: false, error: `scheduler tick failed: ${error.message}` });
  }
}

function start() {
  if (timer) return;
  timer = setInterval(tick, TICK_MS);
  timer.unref();
  setTimeout(tick, 15000).unref(); // boot resume after warm-up
}

function status() {
  const workspace = loadWorkspace();
  const state = loadState();
  return {
    enabled: !!(workspace.plan && workspace.plan.scheduleEnabled),
    plan: workspace.plan || null,
    today: state.days,
    recentRuns: state.runs.slice(0, 30),
  };
}

function validateSchedule(delayMinutes, operation) {
  ScheduleContract.validate(delayMinutes, operation);
}

module.exports = { start, status, tick, validateSchedule };
