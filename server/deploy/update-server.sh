#!/usr/bin/env bash
# OrbitPress Server Edition — safe update: pull latest code, rebuild, restart.
set -euo pipefail
APP_DIR="${ORBITPRESS_DIR:-/opt/orbitpress}"
BRANCH="${ORBITPRESS_BRANCH:-arena/01a08173-orbitpress}"

cd "$APP_DIR"
git fetch origin --prune
git checkout "$BRANCH"
if git merge-base --is-ancestor HEAD "origin/$BRANCH"; then
  git pull --ff-only origin "$BRANCH"
else
  # The session branch was force-pushed during development — this clone is a
  # pure deploy copy (no local commits), so aligning is safe. .env and other
  # untracked files (data volume lives in Docker) are untouched by reset --hard.
  echo "[orbitpress] local copy diverged; hard-aligning with origin/$BRANCH"
  git reset --hard "origin/$BRANCH"
fi
docker compose up -d --build
docker image prune -f >/dev/null 2>&1 || true
echo "[orbitpress] تم التحديث وإعادة التشغيل ✅"
