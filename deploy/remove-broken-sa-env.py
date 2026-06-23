#!/usr/bin/env python3
"""Remove broken FIREBASE_SERVICE_ACCOUNT line from VPS .env (use file instead)."""
import os
import re
import sys

import paramiko

ENV_PATH = "/var/www/spa/.env.production"


def main() -> int:
    password = os.environ.get("VPS_SSH_PASSWORD", "")
    if not password:
        print("Set VPS_SSH_PASSWORD.", file=sys.stderr)
        return 1

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect("217.216.87.128", username="root", password=password, timeout=30)

    sftp = client.open_sftp()
    with sftp.file(ENV_PATH, "r") as f:
        content = f.read().decode("utf-8")
    content = re.sub(r"^FIREBASE_SERVICE_ACCOUNT=.*\n?", "", content, flags=re.MULTILINE)
    with sftp.file(ENV_PATH, "w") as f:
        f.write(content)
    sftp.close()
    client.close()
    print("Removed broken FIREBASE_SERVICE_ACCOUNT from .env.production")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
