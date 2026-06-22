#!/usr/bin/env python3
"""One-shot VPS setup over SSH. Run locally: python deploy/remote-vps-setup.py"""
import os
import paramiko
import sys

HOST = os.environ.get("VPS_HOST", "217.216.87.128")
USER = os.environ.get("VPS_USER", "root")
PASSWORD = os.environ.get("VPS_SSH_PASSWORD", "")

SETUP_SCRIPT = r"""
set -e
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl git nginx ufw ca-certificates

if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y -qq nodejs
fi

npm install -g pm2 2>/dev/null || true

mkdir -p /var/www
if [ ! -d /var/www/spa/.git ]; then
  rm -rf /var/www/spa
  git clone --branch main https://github.com/KAUSHALDIXITDUMMYy/SPA.git /var/www/spa
else
  cd /var/www/spa && git fetch origin && git reset --hard origin/main
fi

cd /var/www/spa
npm ci
npm run build
cp -r public .next/standalone/public
mkdir -p .next/standalone/.next
cp -r .next/static .next/standalone/.next/static

if [ ! -f .env.production ]; then
  cp deploy/env.production.example .env.production
fi

pm2 delete spa-backend 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save
ENV_SETUP=$(pm2 startup systemd -u root --hp /root 2>/dev/null | tail -1)
if [ -n "$ENV_SETUP" ]; then eval "$ENV_SETUP"; fi

cp deploy/nginx-spa-api.conf /etc/nginx/sites-available/spa-api
ln -sf /etc/nginx/sites-available/spa-api /etc/nginx/sites-enabled/spa-api
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx
systemctl enable nginx

ufw allow OpenSSH 2>/dev/null || true
ufw allow 80/tcp 2>/dev/null || true
ufw allow 443/tcp 2>/dev/null || true
ufw --force enable 2>/dev/null || true

echo SETUP_COMPLETE
pm2 status
curl -s -o /dev/null -w "LOCAL_API_HTTP:%{http_code}\n" -X POST http://127.0.0.1:3000/api/contact -H "Content-Type: application/json" -d '{"name":"t","email":"t@t.com","subject":"t","message":"t"}' || true
curl -s -o /dev/null -w "NGINX_API_HTTP:%{http_code}\n" -X POST http://127.0.0.1/api/contact -H "Content-Type: application/json" -d '{"name":"t","email":"t@t.com","subject":"t","message":"t"}' || true
"""


def main() -> int:
    if not PASSWORD:
        print("Set VPS_SSH_PASSWORD environment variable.", file=sys.stderr)
        return 1
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f"Connecting to {HOST}...")
    client.connect(HOST, username=USER, password=PASSWORD, timeout=30)
    print("Running setup (may take several minutes)...")
    stdin, stdout, stderr = client.exec_command(SETUP_SCRIPT, get_pty=True, timeout=900)
    out = stdout.read().decode(errors="replace")
    err = stderr.read().decode(errors="replace")
    print(out)
    if err.strip():
        print("STDERR:", err)
    client.close()
    return 0 if "SETUP_COMPLETE" in out else 1


if __name__ == "__main__":
    sys.exit(main())
