import os
import paramiko

NGINX_CONF = r"""server {
    listen 80;
    listen [::]:80;
    server_name 217.216.87.128;

    client_max_body_size 10M;

    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }

    location / {
        return 404;
    }
}
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("217.216.87.128", username="root", password=os.environ["VPS_SSH_PASSWORD"], timeout=30)

sftp = c.open_sftp()
with sftp.file("/etc/nginx/sites-available/spa-api", "w") as f:
    f.write(NGINX_CONF)
sftp.close()

cmds = [
    "ln -sf /etc/nginx/sites-available/spa-api /etc/nginx/sites-enabled/spa-api",
    "rm -f /etc/nginx/sites-enabled/default",
    "nginx -t",
    "systemctl reload nginx",
    "curl -s -o /dev/null -w 'external80:%{http_code}' -X POST http://217.216.87.128/api/contact -H 'Content-Type: application/json' -d '{\"name\":\"t\",\"email\":\"t@t.com\",\"subject\":\"t\",\"message\":\"t\"}'",
]
out = []
for cmd in cmds:
    _, o, e = c.exec_command(cmd)
    out.append(f"$ {cmd}\n{o.read().decode()}{e.read().decode()}")
c.close()
open("deploy/vps-status.txt", "w", encoding="utf-8").write("\n".join(out))
