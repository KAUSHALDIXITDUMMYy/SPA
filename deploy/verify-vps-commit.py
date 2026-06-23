#!/usr/bin/env python3
"""Check VPS git commit and PM2 status after revert."""
import os
import sys

import paramiko

HOST = os.environ.get("VPS_HOST", "217.216.87.128")
USER = os.environ.get("VPS_USER", "root")
PASSWORD = os.environ.get("VPS_SSH_PASSWORD", "")
APP_DIR = "/var/www/spa"


def log(msg: str) -> None:
    sys.stdout.buffer.write((msg + "\n").encode("utf-8", "replace"))


def run(client: paramiko.SSHClient, cmd: str) -> str:
    _, stdout, stderr = client.exec_command(cmd)
    return stdout.read().decode("utf-8", "replace") + stderr.read().decode("utf-8", "replace")


def main() -> int:
    if not PASSWORD:
        log("Set VPS_SSH_PASSWORD.")
        return 1

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USER, password=PASSWORD, timeout=30)

    log("=== GIT ===")
    log(run(client, f"cd {APP_DIR} && git log -1 --oneline && git status -sb"))

    log("=== PM2 ===")
    log(run(client, "pm2 status spa-backend"))

    log("=== HEALTH ===")
    log(
        run(
            client,
            "curl -s -o /dev/null -w 'api:%{http_code}' -X POST "
            "http://127.0.0.1/api/contact -H 'Content-Type: application/json' "
            "-d '{\"name\":\"t\",\"email\":\"t@t.com\",\"subject\":\"t\",\"message\":\"t\"}'",
        )
    )

    client.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
