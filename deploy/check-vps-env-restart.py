#!/usr/bin/env python3
"""Audit VPS .env.production, restart spa-backend, verify API."""
import os
import sys
import time

import paramiko

HOST = os.environ.get("VPS_HOST", "217.216.87.128")
USER = os.environ.get("VPS_USER", "root")
PASSWORD = os.environ.get("VPS_SSH_PASSWORD", "")
ENV_PATH = "/var/www/spa/.env.production"

REQUIRED = [
    "NODE_ENV",
    "PORT",
    "HOSTNAME",
    "NEXT_PUBLIC_BASE_URL",
    "NEXT_PUBLIC_FIREBASE_API_KEY",
    "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
    "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
    "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
    "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
    "NEXT_PUBLIC_FIREBASE_APP_ID",
    "FIREBASE_SERVICE_ACCOUNT",
    "AGORA_APP_ID",
    "AGORA_APP_CERTIFICATE",
]
OPTIONAL = [
    "NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID",
    "NEXT_PUBLIC_ZOOM_MEETING_SDK_KEY",
    "ZOOM_ACCOUNT_ID",
    "ZOOM_CLIENT_ID",
    "ZOOM_CLIENT_SECRET",
    "ZOOM_MEETING_SDK_SECRET",
    "AGORA_CUSTOMER_ID",
    "AGORA_CUSTOMER_SECRET",
]


def parse_env(text: str) -> dict[str, str]:
    env: dict[str, str] = {}
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        env[key.strip()] = value.strip()
    return env


def run(client: paramiko.SSHClient, cmd: str) -> str:
    _, stdout, stderr = client.exec_command(cmd)
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    return out + err


def log(msg: str) -> None:
    sys.stdout.buffer.write((msg + "\n").encode("utf-8", "replace"))


def main() -> int:
    if not PASSWORD:
        log("Set VPS_SSH_PASSWORD environment variable.")
        return 1

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USER, password=PASSWORD, timeout=30)

    raw = run(client, f"test -f {ENV_PATH} && cat {ENV_PATH} || echo MISSING_FILE")
    if raw.strip() == "MISSING_FILE":
        log(f"ERROR: {ENV_PATH} not found")
        client.close()
        return 1

    env = parse_env(raw)
    missing: list[str] = []

    log("=== ENV AUDIT ===")
    for key in REQUIRED:
        val = env.get(key, "")
        if not val:
            log(f"  MISSING  {key}")
            missing.append(key)
        elif key == "FIREBASE_SERVICE_ACCOUNT":
            ok = val.startswith("{") and "private_key" in val and "project_id" in val
            log(f"  SET      {key} (json, len={len(val)}, valid={ok})")
            if not ok:
                missing.append(key)
        else:
            log(f"  SET      {key} (len={len(val)})")

    log("--- Optional ---")
    for key in OPTIONAL:
        val = env.get(key, "")
        status = "SET" if val else "MISSING"
        suffix = f" (len={len(val)})" if val else ""
        log(f"  {status:8} {key}{suffix}")

    log("\n=== PM2 BEFORE ===")
    log(run(client, "pm2 status spa-backend"))

    log("=== RESTARTING spa-backend ===")
    log(run(client, "cd /var/www/spa && pm2 restart ecosystem.config.cjs --update-env && pm2 save"))

    time.sleep(3)

    log("=== PM2 AFTER ===")
    log(run(client, "pm2 status spa-backend"))

    log("=== API HEALTH ===")
    contact_body = '{"name":"t","email":"t@t.com","subject":"t","message":"t"}'
    log(
        run(
            client,
            f"curl -s -o /dev/null -w 'contact3000:%{{http_code}}' -X POST "
            f"http://127.0.0.1:3000/api/contact -H 'Content-Type: application/json' -d '{contact_body}'",
        )
    )
    log(
        run(
            client,
            f"curl -s -o /dev/null -w 'contact80:%{{http_code}}' -X POST "
            f"http://127.0.0.1/api/contact -H 'Content-Type: application/json' -d '{contact_body}'",
        )
    )

    log("=== RECENT LOGS ===")
    log(run(client, "pm2 logs spa-backend --lines 15 --nostream 2>&1")[-2500:])

    log("\n=== SUMMARY ===")
    if missing:
        log(f"Required missing or invalid: {', '.join(missing)}")
    else:
        log("All required env vars are set.")
    log("Backend restarted.")

    client.close()
    return 0 if not missing else 2


if __name__ == "__main__":
    raise SystemExit(main())
