#!/usr/bin/env python3
"""Upload service-account.json to VPS standalone dir for firebase-admin."""
import os
import sys
from pathlib import Path

import paramiko

HOST = os.environ.get("VPS_HOST", "217.216.87.128")
USER = os.environ.get("VPS_USER", "root")
PASSWORD = os.environ.get("VPS_SSH_PASSWORD", "")
LOCAL_SA = Path(__file__).resolve().parents[1] / "scripts" / "service-account.json"
REMOTE_SA = "/var/www/spa/.next/standalone/service-account.json"


def main() -> int:
    if not PASSWORD:
        print("Set VPS_SSH_PASSWORD.", file=sys.stderr)
        return 1
    if not LOCAL_SA.is_file():
        print(f"Missing {LOCAL_SA}", file=sys.stderr)
        return 1

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USER, password=PASSWORD, timeout=30)

    sftp = client.open_sftp()
    sftp.put(str(LOCAL_SA), REMOTE_SA)
    sftp.close()

    client.exec_command(f"chmod 600 {REMOTE_SA}")
    _, stdout, _ = client.exec_command(
        f"wc -c {REMOTE_SA} && cd /var/www/spa && pm2 restart ecosystem.config.cjs --update-env && pm2 save"
    )
    sys.stdout.buffer.write(stdout.read())
    client.close()
    print("Service account file uploaded and backend restarted.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
