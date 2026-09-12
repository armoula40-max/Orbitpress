#!/usr/bin/env bash
# OrbitPress Server Edition — safe update: fetch the target branch (creating
# it locally even when this deploy clone was made single-branch), rebuild.
set -euo pipefail
APP_DIR="${ORBITPRESS_DIR:-/opt/orbitpress}"
BRANCH="${ORBITPRESS_BRANCH:-feature/orbitpress-polish}"

cd "$APP_DIR"

# The installer clones with --depth 1 --single-branch, so a target branch the
# clone has never seen is unknown to git and "git checkout $BRANCH" fails with
# "pathspec did not match". Fetch the exact branch into FETCH_HEAD, then create
# (or reset) the local branch to it. This is a pure deploy copy: .env and any
# untracked files are preserved by checkout -B / reset --hard.
git fetch origin --prune
git fetch --depth 1 origin "$BRANCH"
git checkout -B "$BRANCH" FETCH_HEAD
git reset --hard FETCH_HEAD

docker compose up -d --build
docker image prune -f >/dev/null 2>&1 || true
echo "[orbitpress] تم التحديث إلى فرع $BRANCH وإعادة التشغيل ✅"
