#!/usr/bin/env python3
"""Set missing Firebase public + service account env on VPS, then restart."""
import json
import os
import re
import sys
from pathlib import Path

import paramiko

HOST = os.environ.get("VPS_HOST", "217.216.87.128")
USER = os.environ.get("VPS_USER", "root")
PASSWORD = os.environ.get("VPS_SSH_PASSWORD", "")
ENV_PATH = "/var/www/spa/.env.production"
ROOT = Path(__file__).resolve().parents[1]
SERVICE_ACCOUNT_PATH = ROOT / "scripts" / "service-account.json"

PUBLIC_VARS = {
    "NEXT_PUBLIC_BASE_URL": "https://sportsmagicianaudio.vercel.app",
    "NEXT_PUBLIC_FIREBASE_API_KEY": "AIzaSyDnSdq0hxP0xmrZT-QuBM8Gfh2jeKj0QT0",
    "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN": "sportsmagician-audio.firebaseapp.com",
    "NEXT_PUBLIC_FIREBASE_PROJECT_ID": "sportsmagician-audio",
    "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET": "sportsmagician-audio.firebasestorage.app",
    "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID": "527934608433",
    "NEXT_PUBLIC_FIREBASE_APP_ID": "1:527934608433:web:95d450cb32e2f1513fb110",
    "NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID": "G-CMEYMHRY34",
}


def set_env_line(content: str, key: str, value: str) -> str:
    line = f"{key}={value}"
    pattern = re.compile(rf"^{re.escape(key)}=.*$", re.MULTILINE)
    if pattern.search(content):
        return pattern.sub(line, content)
    if content and not content.endswith("\n"):
        content += "\n"
    return content + line + "\n"


def main() -> int:
    if not PASSWORD:
        print("Set VPS_SSH_PASSWORD.", file=sys.stderr)
        return 1
    if not SERVICE_ACCOUNT_PATH.is_file():
        print(f"Missing {SERVICE_ACCOUNT_PATH}", file=sys.stderr)
        return 1

    service_account = json.dumps(json.loads(SERVICE_ACCOUNT_PATH.read_text(encoding="utf-8")), separators=(",", ":"))

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USER, password=PASSWORD, timeout=30)

    sftp = client.open_sftp()
    try:
        with sftp.file(ENV_PATH, "r") as f:
            content = f.read().decode("utf-8")
    except FileNotFoundError:
        with sftp.file("/var/www/spa/deploy/env.production.example", "r") as f:
            content = f.read().decode("utf-8")

    for key, value in PUBLIC_VARS.items():
        content = set_env_line(content, key, value)
    content = set_env_line(content, "FIREBASE_SERVICE_ACCOUNT", service_account)

    with sftp.file(ENV_PATH, "w") as f:
        f.write(content)
    sftp.close()

    _, stdout, stderr = client.exec_command(
        "cd /var/www/spa && pm2 restart ecosystem.config.cjs --update-env && pm2 save && sleep 2 && pm2 status spa-backend"
    )
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    client.close()

    Path("deploy/last-vps-firebase-update.txt").write_text(out + err, encoding="utf-8")
    print("Firebase env vars set on VPS and spa-backend restarted.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
