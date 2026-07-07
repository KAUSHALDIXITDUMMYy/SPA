#!/usr/bin/env python3
"""Read-only health/state check of the VPS deploy (keepalive enabled)."""
import os
import sys

import paramiko

HOST = os.environ.get("VPS_HOST", "217.216.87.128")
USER = os.environ.get("VPS_USER", "root")
PASSWORD = os.environ.get("VPS_SSH_PASSWORD", "")
APP_DIR = "/var/www/spa"


def log(msg: str) -> None:
    sys.stdout.buffer.write((msg + "\n").encode("utf-8", "replace"))


def run(client, cmd):
    _, out, err = client.exec_command(cmd, timeout=60)
    return out.read().decode("utf-8", "replace") + err.read().decode("utf-8", "replace")


def main() -> int:
    if not PASSWORD:
        log("Set VPS_SSH_PASSWORD.")
        return 1
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USER, password=PASSWORD, timeout=30)
    client.get_transport().set_keepalive(15)

    log("=== git HEAD ===")
    log(run(client, f"cd {APP_DIR} && git log --oneline -1"))
    log("=== memory ===")
    log(run(client, "free -m"))
    log("=== build artifacts (standalone) ===")
    log(run(client, f"ls -la {APP_DIR}/.next/standalone/server.js {APP_DIR}/.next/BUILD_ID 2>&1; "
                    f"echo '--- standalone .next/static ---'; ls {APP_DIR}/.next/standalone/.next/static 2>&1 | head -5; "
                    f"echo '--- standalone public ---'; ls {APP_DIR}/.next/standalone/public 2>&1 | head -5; "
                    f"echo '--- SA file ---'; ls -la {APP_DIR}/.next/standalone/service-account.json 2>&1"))
    log("=== pm2 ===")
    log(run(client, "pm2 status spa-backend"))
    log("=== recent logs ===")
    log(run(client, "pm2 logs spa-backend --lines 20 --nostream 2>&1")[-3000:])
    client.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
