#!/usr/bin/env python3
"""Pull latest main on VPS, build, restart PM2, restore service account."""
import os
import sys
import time

import paramiko

HOST = os.environ.get("VPS_HOST", "217.216.87.128")
USER = os.environ.get("VPS_USER", "root")
PASSWORD = os.environ.get("VPS_SSH_PASSWORD", "")
APP_DIR = "/var/www/spa"
LOCAL_SA = os.path.join(os.path.dirname(__file__), "..", "scripts", "service-account.json")
REMOTE_SA = f"{APP_DIR}/.next/standalone/service-account.json"
NGINX_LOCAL = os.path.join(os.path.dirname(__file__), "nginx-spa-api.conf")
NGINX_REMOTE = "/etc/nginx/sites-available/spa-api"


def run(client, cmd, timeout=600):
    _, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    return out + err


def log(msg: str) -> None:
    sys.stdout.buffer.write((msg + "\n").encode("utf-8", "replace"))


def main() -> int:
    if not PASSWORD:
        print("Set VPS_SSH_PASSWORD.", file=sys.stderr)
        return 1

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USER, password=PASSWORD, timeout=30)

    log("=== git pull + build ===")
    build_cmd = (
        f"cd {APP_DIR} && git fetch origin && git reset --hard origin/main && "
        "npm ci && npm run build && "
        f"cp -r public {APP_DIR}/.next/standalone/public && "
        f"mkdir -p {APP_DIR}/.next/standalone/.next && "
        f"cp -r .next/static {APP_DIR}/.next/standalone/.next/static"
    )
    log(run(client, build_cmd, timeout=900))

    if os.path.isfile(LOCAL_SA):
        log("=== service account ===")
        sftp = client.open_sftp()
        sftp.put(LOCAL_SA, REMOTE_SA)
        sftp.close()
        run(client, f"chmod 600 {REMOTE_SA}")

    if os.path.isfile(NGINX_LOCAL):
        log("=== nginx ===")
        sftp = client.open_sftp()
        sftp.put(NGINX_LOCAL, NGINX_REMOTE)
        sftp.close()
        log(run(client, "nginx -t && systemctl reload nginx"))

    log("=== pm2 restart ===")
    log(run(client, f"cd {APP_DIR} && pm2 restart ecosystem.config.cjs --update-env && pm2 save && pm2 status spa-backend"))

    log("=== health ===")
    log(run(client, "curl -s -o /dev/null -w 'api:%{http_code}' -X POST http://127.0.0.1/api/contact -H 'Content-Type: application/json' -d '{\"name\":\"t\",\"email\":\"t@t.com\",\"subject\":\"t\",\"message\":\"t\"}'"))

    client.close()
    log("\nVPS deploy complete.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
