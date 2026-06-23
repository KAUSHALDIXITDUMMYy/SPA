"""Update Agora env vars on VPS .env.production (do not commit secrets)."""
import os
import re
import paramiko

HOST = os.environ.get("VPS_HOST", "217.216.87.128")
USER = os.environ.get("VPS_USER", "root")
PASSWORD = os.environ.get("VPS_SSH_PASSWORD", "")
ENV_PATH = "/var/www/spa/.env.production"

AGORA_APP_ID = os.environ.get("AGORA_APP_ID", "")
AGORA_APP_CERTIFICATE = os.environ.get("AGORA_APP_CERTIFICATE", "")


def set_env_line(content: str, key: str, value: str) -> str:
    line = f"{key}={value}"
    pattern = re.compile(rf"^{re.escape(key)}=.*$", re.MULTILINE)
    if pattern.search(content):
        return pattern.sub(line, content)
    if content and not content.endswith("\n"):
        content += "\n"
    return content + line + "\n"


def main() -> None:
    if not PASSWORD or not AGORA_APP_ID or not AGORA_APP_CERTIFICATE:
        raise SystemExit("Set VPS_SSH_PASSWORD, AGORA_APP_ID, AGORA_APP_CERTIFICATE")

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USER, password=PASSWORD, timeout=30)

    sftp = client.open_sftp()
    try:
        with sftp.file(ENV_PATH, "r") as f:
            content = f.read().decode("utf-8")
    except FileNotFoundError:
        with sftp.file("/var/www/spa/deploy/env.production.example", "r") as f:
            content = f.read().decode("utf-8")

    content = set_env_line(content, "AGORA_APP_ID", AGORA_APP_ID)
    content = set_env_line(content, "AGORA_APP_CERTIFICATE", AGORA_APP_CERTIFICATE)

    with sftp.file(ENV_PATH, "w") as f:
        f.write(content)
    sftp.close()

    _, stdout, stderr = client.exec_command("pm2 restart spa-backend && sleep 2 && pm2 status spa-backend")
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    client.close()

    open("deploy/last-vps-update.txt", "w", encoding="utf-8").write(out + err)
    print("Agora credentials set on VPS and spa-backend restarted.")


if __name__ == "__main__":
    main()
