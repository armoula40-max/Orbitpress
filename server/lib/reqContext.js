'use strict';
/**
 * reqContext.js — per-request tenant context.
 *
 * The server is multi-user: each access code issued by the admin maps to a
 * user whose workspace, settings, images and browser profiles live in their
 * own data directory. The authenticated user for a request is stored in
 * AsyncLocalStorage, so business code keeps its current signatures while
 * every storage path resolves under the right tenant.
 *
 *   data/                         <- the master owner (ORBITPRESS_TOKEN)
 *     users.json                  <- registry of issued access codes (hashes)
 *     audit.logl                  <- owner-level security audit log
 *     users/<userId>/             <- one isolated tenant root
 *       workspace.json settings.json images/ sessions/ ...
 */
const path = require('path');
const { AsyncLocalStorage } = require('async_hooks');

const ROOT_DATA_DIR = process.env.ORBITPRESS_DATA_DIR || path.join(__dirname, '..', 'data');
const OWNER_ID = 'owner';

const als = new AsyncLocalStorage();

function getUserId() {
  return (als.getStore() && als.getStore().userId) || null;
}

function isOwner() {
  const id = getUserId();
  return !id || id === OWNER_ID;
}

function dataDirFor(userId) {
  if (!userId || userId === OWNER_ID) return ROOT_DATA_DIR;
  return path.join(ROOT_DATA_DIR, 'users', String(userId).replace(/[^a-zA-Z0-9_-]/g, ''));
}

function getDataDir() {
  return dataDirFor(getUserId());
}

function runAs(userId, fn) {
  return als.run({ userId: userId || OWNER_ID }, fn);
}

module.exports = { ROOT_DATA_DIR, OWNER_ID, getUserId, isOwner, getDataDir, dataDirFor, runAs };
