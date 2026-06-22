#!/usr/bin/env bash
# Run on VPS as root: bash vps-setup.sh
set -euo pipefail

APP_DIR="/var/www/spa"
REPO="https://github.com/KAUSHALDIXITDUMMYy/SPA.git"
BRANCH="main"

echo "==> System packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl git nginx ufw

if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | cut -d. -f1 | tr -d v)" -lt 20 ]]; then
  echo "==> Node.js 20"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y -qq nodejs
fi

if ! command -v pm2 >/dev/null 2>&1; then
  echo "==> PM2"
  npm install -g pm2
fi

echo "==> App directory"
mkdir -p "$APP_DIR"
if [[ ! -d "$APP_DIR/.git" ]]; then
  git clone --branch "$BRANCH" "$REPO" "$APP_DIR"
else
  cd "$APP_DIR"
  git fetch origin
  git reset --hard "origin/$BRANCH"
fi

cd "$APP_DIR"
npm ci
npm run build

echo "==> Standalone static assets"
cp -r public .next/standalone/public
cp -r .next/static .next/standalone/.next/static

if [[ ! -f "$APP_DIR/.env.production" ]]; then
  echo "!! Create $APP_DIR/.env.production with secrets before starting (see deploy/env.production.example)"
  cp deploy/env.production.example "$APP_DIR/.env.production"
fi

echo "==> PM2"
pm2 delete spa-backend 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup systemd -u root --hp /root || true

echo "==> Nginx"
cp deploy/nginx-spa-api.conf /etc/nginx/sites-available/spa-api
ln -sf /etc/nginx/sites-available/spa-api /etc/nginx/sites-enabled/spa-api
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

echo "==> Firewall"
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable || true

echo "==> Done. API: http://217.216.87.128/api/"
echo "   Edit $APP_DIR/.env.production then: pm2 restart spa-backend"
