#!/usr/bin/env python3
"""Build on VPS without wiping node_modules, then restart PM2."""
import os
import sys

import paramiko

HOST = os.environ.get("VPS_HOST", "217.216.87.128")
USER = os.environ.get("VPS_USER", "root")
PASSWORD = os.environ.get("VPS_SSH_PASSWORD", "")
APP_DIR = "/var/www/spa"
LOCAL_SA = os.path.join(os.path.dirname(__file__), "..", "scripts", "service-account.json")
REMOTE_SA = f"{APP_DIR}/.next/standalone/service-account.json"


def log(msg: str) -> None:
    sys.stdout.buffer.write((msg + "\n").encode("utf-8", "replace"))
    sys.stdout.flush()


def run(client, cmd, timeout=900):
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

    build_cmd = (
        f"cd {APP_DIR} && git fetch origin && git reset --hard origin/main && "
        "npm ci && rm -rf .next && npm run build && "
        f"cp -r public {APP_DIR}/.next/standalone/public && "
        f"mkdir -p {APP_DIR}/.next/standalone/.next && "
        f"cp -r .next/static {APP_DIR}/.next/standalone/.next/static && "
        "echo BUILD_OK"
    )

    log("=== build ===")
    out = run(client, build_cmd)
    log(out[-8000:])
    if "BUILD_OK" not in out:
        log("BUILD FAILED")
        client.close()
        return 1

    if os.path.isfile(LOCAL_SA):
        log("=== service account ===")
        sftp = client.open_sftp()
        sftp.put(LOCAL_SA, REMOTE_SA)
        sftp.close()
        run(client, f"chmod 600 {REMOTE_SA}")

    log("=== pm2 restart ===")
    log(run(client, f"cd {APP_DIR} && pm2 restart ecosystem.config.cjs --update-env && pm2 save && pm2 status spa-backend"))

    log("=== verify ===")
    log(run(client, f"cd {APP_DIR} && git log -1 --oneline && ls -la .next/BUILD_ID .next/standalone/server.js"))
    body = '{"name":"t","email":"t@t.com","subject":"t","message":"t"}'
    log(
        run(
            client,
            "curl -s -o /dev/null -w 'api:%{http_code}' -X POST http://127.0.0.1/api/contact "
            "-H 'Content-Type: application/json' "
            f"-d '{body}'",
        )
    )

    client.close()
    log("\nVPS build + restart complete.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
