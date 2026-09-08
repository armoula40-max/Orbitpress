#!/usr/bin/env bash
# OrbitPress Server Edition — safe update: pull latest code, rebuild, restart.
set -euo pipefail
APP_DIR="${ORBITPRESS_DIR:-/opt/orbitpress}"
BRANCH="${ORBITPRESS_BRANCH:-arena/01a08173-orbitpress}"

cd "$APP_DIR"
git fetch --all --prune
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"
docker compose up -d --build
docker image prune -f >/dev/null 2>&1 || true
echo "[orbitpress] تم التحديث وإعادة التشغيل ✅"
