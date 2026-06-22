import os
import paramiko

cmds = [
    "nginx -t 2>&1",
    "cat /etc/nginx/sites-enabled/spa-api",
    "curl -s -o /dev/null -w 'direct3000:%{http_code}' -X POST http://127.0.0.1:3000/api/contact -H 'Content-Type: application/json' -d '{\"name\":\"t\",\"email\":\"t@t.com\",\"subject\":\"t\",\"message\":\"t\"}'",
    "curl -s -o /dev/null -w ' nginx80:%{http_code}' -X POST http://127.0.0.1/api/contact -H 'Content-Type: application/json' -d '{\"name\":\"t\",\"email\":\"t@t.com\",\"subject\":\"t\",\"message\":\"t\"}'",
    "pm2 logs spa-backend --lines 15 --nostream 2>&1",
]

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("217.216.87.128", username="root", password=os.environ["VPS_SSH_PASSWORD"], timeout=30)
out = []
for cmd in cmds:
    _, o, e = c.exec_command(cmd)
    out.append(f"$ {cmd}\n{o.read().decode('utf-8','replace')}{e.read().decode('utf-8','replace')}")
c.close()
open("deploy/vps-status.txt", "w", encoding="utf-8").write("\n".join(out))
