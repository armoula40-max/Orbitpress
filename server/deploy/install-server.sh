#!/usr/bin/env bash
# OrbitPress Server Edition — one-shot installer for a fresh Ubuntu 22.04/24.04 VPS.
#
# Usage on the server (as root or with sudo):
#   bash <(curl -fsSL https://raw.githubusercontent.com/armoula40-max/Orbitpress/feature/orbitpress-polish/server/deploy/install-server.sh)
# or after cloning the repo:
#   bash server/deploy/install-server.sh
#
# What it does:
#   1) installs Docker Engine (+ compose plugin) when missing
#   2) clones / updates the Orbitpress repository into /opt/orbitpress
#   3) generates a strong ORBITPRESS_TOKEN into /opt/orbitpress/.env (kept on a later run)
#   4) builds and starts the container with docker compose
#   5) prints the URL + access token
set -euo pipefail

APP_DIR="${ORBITPRESS_DIR:-/opt/orbitpress}"
REPO_URL="${ORBITPRESS_REPO:-https://github.com/armoula40-max/Orbitpress.git}"
BRANCH="${ORBITPRESS_BRANCH:-feature/orbitpress-polish}"

log() { printf '\033[1;32m[orbitpress]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[orbitpress] ERROR:\033[0m %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "شغّل السكربت كـ root (أو sudo)."

# --- 1) Docker ---------------------------------------------------------------
if ! command -v docker >/dev/null 2>&1; then
  log "تثبيت Docker Engine…"
  apt-get update -y
  apt-get install -y ca-certificates curl gnupg git ufw
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  . /etc/os-release
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
else
  log "Docker موجود مسبقاً."
fi
docker compose version >/dev/null 2>&1 || die "إضافة docker compose غير متوفرة."

# --- 2) source code ----------------------------------------------------------
if [ -d "$APP_DIR/.git" ]; then
  log "تحديث الشيفرة في $APP_DIR …"
  # A single-branch --depth 1 clone does not know other branches; fetch the
  # target explicitly and align the local branch to it (pure deploy copy).
  git -C "$APP_DIR" fetch origin --prune
  git -C "$APP_DIR" fetch --depth 1 origin "$BRANCH"
  git -C "$APP_DIR" checkout -B "$BRANCH" FETCH_HEAD
  git -C "$APP_DIR" reset --hard FETCH_HEAD
else
  log "استنساخ المستودع إلى $APP_DIR …"
  git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi

# --- 3) environment (.env) ---------------------------------------------------
cd "$APP_DIR"
if [ ! -f .env ]; then
  TOKEN="$(openssl rand -hex 20 2>/dev/null || head -c 40 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  cat > .env <<EOF
# OrbitPress access token — this is YOUR password to open the app. Keep it secret.
ORBITPRESS_TOKEN=$TOKEN
# ORBITPRESS_PORT=8080
EOF
  chmod 600 .env
  log "أُنشئ رمز دخول جديد في .env"
else
  log "ملف .env موجود — أُبقي على الرمز الحالي."
fi

# --- 4) build & run -----------------------------------------------------------
log "بناء الصورة وتشغيل الحاوية (أول بناء قد يستغرق 5-10 دقائق: Chromium كبير)…"
docker compose up -d --build

# --- 5) summary ---------------------------------------------------------------
TOKEN="$(grep '^ORBITPRESS_TOKEN=' .env | cut -d= -f2-)"
IP="$(curl -4 -s ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')"
cat <<EOF

$(log 'اكتمل التثبيت ✅')

  الرابط:    http://$IP:${ORBITPRESS_PORT:-8080}/
  رمز الدخول: $TOKEN

  سجلات حيّة:      docker compose -f $APP_DIR/docker-compose.yml logs -f
  إعادة تشغيل:     docker compose -f $APP_DIR/docker-compose.yml restart
  تحديث لاحقاً:    bash $APP_DIR/server/deploy/update-server.sh

تنبيه أمان: الاتصال يعمل عبر HTTP مع رمز الدخول. للتشفير الكامل بدون شراء دومين،
ثبّت Tailscale (مجاني) على السيرفر وأجهزتك وافتح الرابط عبر شبكته الخاصة —
انظر القسم الأخير في docs/DEPLOY_VPS_AR.md.
EOF
