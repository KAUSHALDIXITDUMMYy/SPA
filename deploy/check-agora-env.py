#!/usr/bin/env python3
import os, paramiko, sys
HOST = os.environ.get("VPS_HOST", "217.216.87.128")
PASSWORD = os.environ.get("VPS_SSH_PASSWORD", "")
APP = "/var/www/spa"

def log(m):
    sys.stdout.buffer.write((m + "\n").encode("utf-8", "replace"))

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username="root", password=PASSWORD, timeout=30)

def run(cmd):
    _, o, e = c.exec_command(cmd, timeout=60)
    return (o.read() + e.read()).decode("utf-8", "replace")

log("=== Agora env ===")
log(run(f"grep ^AGORA_ {APP}/.env.production | sed 's/=.*$/=***/'"))
log("=== streaming API (no auth, expect 401) ===")
log(run("curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1/api/streaming?type=active"))
log("")
log("=== agora token route (no auth, expect 401/403) ===")
log(run("curl -s -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1/api/agora/token -H 'Content-Type: application/json' -d '{}'"))
c.close()
