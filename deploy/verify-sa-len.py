import os
import paramiko

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("217.216.87.128", username="root", password=os.environ["VPS_SSH_PASSWORD"], timeout=30)
_, o, _ = c.exec_command(
    "grep '^FIREBASE_SERVICE_ACCOUNT=' /var/www/spa/.env.production | wc -c"
)
print("grep char count:", o.read().decode().strip())
_, o, _ = c.exec_command(
    "python3 - <<'PY'\n"
    "import re\n"
    "text = open('/var/www/spa/.env.production').read()\n"
    "for line in text.splitlines():\n"
    "    if line.startswith('FIREBASE_SERVICE_ACCOUNT='):\n"
    "        val = line.split('=', 1)[1]\n"
    "        print('value_len', len(val))\n"
    "        print('valid_json', val.startswith('{') and 'private_key' in val)\n"
    "PY"
)
print(o.read().decode())
c.close()
