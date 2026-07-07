#!/usr/bin/env python3
"""Wait for the in-progress detached build to finish, then upload SA + restart PM2."""
import os
import sys
import time

import paramiko

HOST = os.environ.get("VPS_HOST", "217.216.87.128")
USER = os.environ.get("VPS_USER", "root")
PASSWORD = os.environ.get("VPS_SSH_PASSWORD", "")
APP_DIR = "/var/www/spa"
LOG = "/tmp/spa-build.log"
LOCAL_SA = os.path.join(os.path.dirname(__file__), "..", "scripts", "service-account.json")
REMOTE_SA = f"{APP_DIR}/.next/standalone/service-account.json"
NGINX_LOCAL = os.path.join(os.path.dirname(__file__), "nginx-spa-api.conf")
NGINX_REMOTE = "/etc/nginx/sites-available/spa-api"


def log(msg):
    sys.stdout.buffer.write((msg + "\n").encode("utf-8", "replace"))
    sys.stdout.flush()


def connect():
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username=USER, password=PASSWORD, timeout=30)
    c.get_transport().set_keepalive(15)
    return c


def run(c, cmd, timeout=120):
    _, o, e = c.exec_command(cmd, timeout=timeout)
    return o.read().decode("utf-8", "replace") + e.read().decode("utf-8", "replace")


def main():
    if not PASSWORD:
        log("Set VPS_SSH_PASSWORD.")
        return 1
    c = connect()

    deadline = time.time() + 1200
    result = None
    while time.time() < deadline:
        try:
            tail = run(c, f"tail -n 4 {LOG}; echo MARK; "
                          f"test -f {APP_DIR}/.next/standalone/server.js && echo HAVE_SERVER || true")
        except Exception as ex:  # noqa: BLE001
            log(f"(reconnecting: {ex})")
            try:
                c.close()
            except Exception:  # noqa: BLE001
                pass
            time.sleep(3)
            c = connect()
            continue
        if "SPA_BUILD_OK" in tail:
            result = "OK"
            break
        if "SPA_BUILD_FAIL" in tail:
            result = "FAIL"
            break
        lines = [l for l in tail.splitlines() if l and l != "MARK"]
        log(f"  …{lines[-1][:90] if lines else 'waiting'}")
        time.sleep(12)

    log("=== build tail ===")
    log(run(c, f"tail -n 20 {LOG}"))
    if result != "OK":
        log("❌ Build not OK yet / failed. Aborting restart.")
        c.close()
        return 1

    chk = run(c, f"test -f {APP_DIR}/.next/standalone/server.js && echo HAVE_SERVER || echo NO_SERVER")
    log(f"artifact: {chk.strip()}")
    if "HAVE_SERVER" not in chk:
        c.close()
        return 1

    if os.path.isfile(LOCAL_SA):
        log("=== upload service account ===")
        sftp = c.open_sftp()
        sftp.put(LOCAL_SA, REMOTE_SA)
        sftp.close()
        run(c, f"chmod 600 {REMOTE_SA}")

    if os.path.isfile(NGINX_LOCAL):
        log("=== nginx ===")
        sftp = c.open_sftp()
        sftp.put(NGINX_LOCAL, NGINX_REMOTE)
        sftp.close()
        log(run(c, "nginx -t && systemctl reload nginx"))

    log("=== pm2 restart ===")
    log(run(c, f"cd {APP_DIR} && pm2 restart ecosystem.config.cjs --update-env && pm2 save && pm2 status spa-backend"))

    time.sleep(3)
    log("=== health ===")
    body = '{"name":"t","email":"t@t.com","subject":"t","message":"t"}'
    log(run(c, f"curl -s -o /dev/null -w 'api3000:%{{http_code}}\\n' -X POST http://127.0.0.1:3000/api/contact -H 'Content-Type: application/json' -d '{body}'"))
    log(run(c, f"curl -s -o /dev/null -w 'api80:%{{http_code}}\\n' -X POST http://127.0.0.1/api/contact -H 'Content-Type: application/json' -d '{body}'"))
    log("=== recent logs ===")
    log(run(c, "pm2 logs spa-backend --lines 12 --nostream 2>&1")[-2000:])
    c.close()
    log("\n✅ VPS deploy complete.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
