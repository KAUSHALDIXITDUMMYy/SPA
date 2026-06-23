#!/usr/bin/env python3
"""Push nginx clone-block config to VPS and reload."""
import os
import paramiko

HOST = os.environ.get("VPS_HOST", "217.216.87.128")
USER = os.environ.get("VPS_USER", "root")
PASSWORD = os.environ.get("VPS_SSH_PASSWORD", "")
LOCAL = os.path.join(os.path.dirname(__file__), "nginx-spa-api.conf")
REMOTE = "/etc/nginx/sites-available/spa-api"

def main() -> None:
    if not PASSWORD:
        raise SystemExit("Set VPS_SSH_PASSWORD")
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USER, password=PASSWORD, timeout=30)
    sftp = client.open_sftp()
    sftp.put(LOCAL, REMOTE)
    sftp.close()
    for cmd in ("nginx -t", "systemctl reload nginx"):
        _, o, e = client.exec_command(cmd)
        out = o.read().decode("utf-8", "replace") + e.read().decode("utf-8", "replace")
        print(out)
    client.close()
    print("nginx updated with intelsnipers.com block")

if __name__ == "__main__":
    main()
