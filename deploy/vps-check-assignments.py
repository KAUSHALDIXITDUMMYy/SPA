#!/usr/bin/env python3
"""Check stream-assignments bootstrap slowness on live VPS (read-only)."""
import os
import sys

import paramiko

HOST = os.environ.get("VPS_HOST", "217.216.87.128")
PASSWORD = os.environ.get("VPS_SSH_PASSWORD", "")


def log(msg: str) -> None:
    sys.stdout.buffer.write((msg + "\n").encode("utf-8", "replace"))
    sys.stdout.flush()


def run(client, cmd, timeout=120):
    _, out, err = client.exec_command(cmd, timeout=timeout)
    return (out.read() + err.read()).decode("utf-8", "replace")


def main() -> int:
    if not PASSWORD:
        log("Set VPS_SSH_PASSWORD.")
        return 1

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username="root", password=PASSWORD, timeout=30)
    client.get_transport().set_keepalive(15)

    log("=== admin/data in nginx (last 2000) ===")
    log(
        run(
            client,
            "grep '/api/admin/data' /var/log/nginx/access.log 2>/dev/null | tail -20",
        )
    )
    log(
        run(
            client,
            "grep '/api/admin/data' /var/log/nginx/access.log 2>/dev/null | wc -l",
        ).strip()
        + " total admin/data hits in log"
    )

    log("\n=== pm2 errors mentioning bootstrap / admin-data / getAllUsers ===")
    log(
        run(
            client,
            "grep -E 'getStreamAssignmentsBootstrap|admin/data|getAllUsers|orderBy' "
            "/root/.pm2/logs/spa-backend-error-0.log 2>/dev/null | tail -30",
        )
    )

    log("\n=== pm2 latency now ===")
    log(run(client, "pm2 describe spa-backend 2>&1 | grep -E 'Latency|HTTP|Active'"))

    log("\n=== unauthenticated admin/data timing (expect 401 fast) ===")
    log(
        run(
            client,
            "curl -s -o /dev/null -w '401 probe total=%{time_total}\\n' "
            "-X POST http://127.0.0.1/api/admin/data "
            "-H 'Content-Type: application/json' "
            "-d '{\"action\":\"getStreamAssignmentsBootstrap\"}' -m 30",
        ).strip()
    )

    log("\n=== node event loop / active handles ===")
    log(run(client, "pm2 describe spa-backend 2>&1 | grep -E 'Active|Event Loop|Heap'"))

    client.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
