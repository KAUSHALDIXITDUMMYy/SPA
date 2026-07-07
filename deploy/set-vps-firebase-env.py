#!/usr/bin/env python3
"""Point the VPS .env.production at the NEW Firebase project (smas-57b80).

Updates the public NEXT_PUBLIC_FIREBASE_* values and the server-side
FIREBASE_SERVICE_ACCOUNT (read from the local, gitignored scripts/service-account.json).
Does NOT restart — run vps-deploy.py afterwards so the rebuild bakes the new
NEXT_PUBLIC_* values into the client bundle.
"""
import json
import os
import sys

import paramiko

HOST = os.environ.get("VPS_HOST", "217.216.87.128")
USER = os.environ.get("VPS_USER", "root")
PASSWORD = os.environ.get("VPS_SSH_PASSWORD", "")
ENV_PATH = "/var/www/spa/.env.production"
LOCAL_SA = os.path.join(os.path.dirname(__file__), "..", "scripts", "service-account.json")

# Public Firebase web config for the NEW project (safe to expose; these ship to browsers).
PUBLIC = {
    "NEXT_PUBLIC_FIREBASE_API_KEY": "AIzaSyAl_NAMkwgrLfmNyQof0cwzjFSmOQc1rCA",
    "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN": "smas-57b80.firebaseapp.com",
    "NEXT_PUBLIC_FIREBASE_PROJECT_ID": "smas-57b80",
    "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET": "smas-57b80.firebasestorage.app",
    "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID": "78156872254",
    "NEXT_PUBLIC_FIREBASE_APP_ID": "1:78156872254:web:9f94204eaba12d0840ef6f",
    "NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID": "G-ZHN1GLFY07",
}


def log(msg: str) -> None:
    sys.stdout.buffer.write((msg + "\n").encode("utf-8", "replace"))


def main() -> int:
    if not PASSWORD:
        log("Set VPS_SSH_PASSWORD.")
        return 1

    with open(LOCAL_SA, "r", encoding="utf-8") as f:
        sa = json.load(f)
    if sa.get("project_id") != "smas-57b80":
        log(f"Refusing: local service account is for '{sa.get('project_id')}', not smas-57b80.")
        return 1
    sa_min = json.dumps(sa, separators=(",", ":"))  # single line for dotenv

    updates = dict(PUBLIC)
    updates["FIREBASE_SERVICE_ACCOUNT"] = sa_min

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USER, password=PASSWORD, timeout=30)

    sftp = client.open_sftp()
    try:
        with sftp.file(ENV_PATH, "r") as f:
            content = f.read().decode("utf-8")
    except FileNotFoundError:
        content = ""

    # Rebuild line-by-line (no regex → no corruption of the JSON's backslashes/$).
    seen = set()
    out_lines = []
    for line in content.splitlines():
        stripped = line.strip()
        if stripped and not stripped.startswith("#") and "=" in stripped:
            key = stripped.split("=", 1)[0].strip()
            if key in updates:
                out_lines.append(f"{key}={updates[key]}")
                seen.add(key)
                continue
        out_lines.append(line)
    for key, val in updates.items():
        if key not in seen:
            out_lines.append(f"{key}={val}")

    new_content = "\n".join(out_lines).rstrip("\n") + "\n"
    with sftp.file(ENV_PATH, "w") as f:
        f.write(new_content)
    sftp.close()

    log("=== Updated .env.production keys ===")
    for key in updates:
        val = updates[key]
        log(f"  {key} (len={len(val)})")

    # Verify the SA value parses back to the right project on the server.
    check = client.exec_command(
        "cd /var/www/spa && node -e \""
        "require('dotenv').config({path:'.env.production'});"
        "try{const j=JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);"
        "console.log('SA project_id =', j.project_id);}"
        "catch(e){console.log('SA parse FAILED:', e.message);}"
        "console.log('PUBLIC project =', process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);\""
    )
    log("=== server-side verification ===")
    log(check[1].read().decode("utf-8", "replace") + check[2].read().decode("utf-8", "replace"))

    client.close()
    log("Done. Next: run deploy/vps-deploy.py to rebuild + restart.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
