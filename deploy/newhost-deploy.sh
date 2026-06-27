#!/usr/bin/env bash
# Deploy the backend on the new server (38.248.12.6) that also runs RustDesk.
# Run as the `ubuntu` user. Pulls latest main, rebuilds, restarts PM2.
# Service account + .env.production live outside .next so they survive rebuilds.
set -e

APP_DIR=/var/www/spa
cd "$APP_DIR"

# Preserve the service account across the .next wipe (first run seeds the persistent copy).
if [ -f .next/standalone/service-account.json ] && [ ! -f service-account.json ]; then
  cp .next/standalone/service-account.json service-account.json
fi

git fetch origin
git reset --hard origin/main

# Install deps only when the lockfile changed (keeps redeploys fast).
if ! git diff --quiet HEAD@{1} HEAD -- package-lock.json 2>/dev/null; then
  npm ci
fi

rm -rf .next
npm run build
cp -r public .next/standalone/public
mkdir -p .next/standalone/.next
cp -r .next/static .next/standalone/.next/static

if [ -f service-account.json ]; then
  cp service-account.json .next/standalone/service-account.json
  chmod 600 .next/standalone/service-account.json
fi

pm2 restart spa-backend --update-env
pm2 save
echo DEPLOY_OK
