#!/usr/bin/env python3
"""Read-only VPS diagnostics for slow queries — does NOT restart anything."""
import os
import sys

import paramiko

HOST = os.environ.get("VPS_HOST", "217.216.87.128")
USER = os.environ.get("VPS_USER", "root")
PASSWORD = os.environ.get("VPS_SSH_PASSWORD", "")
APP_DIR = "/var/www/spa"


def log(msg: str) -> None:
    sys.stdout.buffer.write((msg + "\n").encode("utf-8", "replace"))
    sys.stdout.flush()


def run(client, cmd, timeout=90):
    _, out, err = client.exec_command(cmd, timeout=timeout)
    return (out.read() + err.read()).decode("utf-8", "replace")


def main() -> int:
    if not PASSWORD:
        log("Set VPS_SSH_PASSWORD.")
        return 1

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USER, password=PASSWORD, timeout=30)
    client.get_transport().set_keepalive(15)

    log("=== uptime / load / memory / disk ===")
    log(run(client, "uptime; echo '---'; free -h; echo '---'; df -h / /var"))

    log("\n=== vmstat (3 samples) ===")
    log(run(client, "vmstat 1 3"))

    log("\n=== top CPU processes ===")
    log(run(client, "ps aux --sort=-%cpu | head -15"))

    log("\n=== top MEM processes ===")
    log(run(client, "ps aux --sort=-%mem | head -15"))

    log("\n=== pm2 status ===")
    log(run(client, "pm2 status"))

    log("\n=== pm2 describe spa-backend ===")
    log(run(client, "pm2 describe spa-backend 2>&1 | head -100"))

    log("\n=== node process stats ===")
    log(
        run(
            client,
            "PID=$(pm2 pid spa-backend 2>/dev/null); "
            "echo PID=$PID; "
            'if [ -n "$PID" ]; then '
            "ls /proc/$PID/fd 2>/dev/null | wc -l; "
            'cat /proc/$PID/status 2>/dev/null | egrep "VmRSS|Threads|voluntary"; '
            "fi",
        )
    )

    log("\n=== nginx + connections ===")
    log(run(client, "systemctl is-active nginx; ss -s; echo established=$(ss -tn state established | wc -l)"))

    log("\n=== recent pm2 logs (last 100 lines) ===")
    log(run(client, "pm2 logs spa-backend --lines 100 --nostream 2>&1")[-12000:])

    log("\n=== api latency (local curl, expect 401 without auth) ===")
    paths = [
        "/api/streaming?type=active",
        "/api/subscriber?type=permissions&subscriberId=test",
        "/api/analytics?type=publisher&publisherId=test",
        "/api/scheduled-calls?date=2026-06-25",
    ]
    for path in paths:
        log(
            run(
                client,
                f"curl -s -o /dev/null -w '{path} code=%{{http_code}} "
                f"connect=%{{time_connect}} start=%{{time_starttransfer}} "
                f"total=%{{time_total}}\\n' "
                f"'http://127.0.0.1{path}' -m 30",
            ).strip()
        )

    log("\n=== env keys (values redacted) ===")
    log(run(client, f"grep -E '^(FIREBASE_|GOOGLE_|NODE_|PM2_|AGORA_)' {APP_DIR}/.env.production 2>/dev/null | sed 's/=.*$/=***/'"))

    log("\n=== kernel / oom tail ===")
    log(run(client, "dmesg -T 2>/dev/null | tail -20 || journalctl -k -n 20 --no-pager 2>/dev/null"))

    log("\n=== git HEAD on server ===")
    log(run(client, f"cd {APP_DIR} && git log --oneline -1"))

    log("\n=== error counts in pm2 error log ===")
    err_log = "/root/.pm2/logs/spa-backend-error-0.log"
    for pattern in [
        "requires an index",
        "api/chat",
        "api/subscriber",
        "api/admin",
        "duration",
    ]:
        log(
            run(
                client,
                f"grep -c '{pattern}' {err_log} 2>/dev/null || echo 0",
            ).strip()
            + f"  ({pattern})"
        )

    log("\n=== nginx top endpoints (last 1000 requests) ===")
    log(
        run(
            client,
            "tail -1000 /var/log/nginx/access.log 2>/dev/null | awk '{print $7}' | sort | uniq -c | sort -nr | head -20",
        )
    )

    client.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
