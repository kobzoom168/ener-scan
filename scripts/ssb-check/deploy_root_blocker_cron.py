import base64
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent
script = (ROOT / "add_root_blocker_cron.sh").read_bytes().replace(b"\r\n", b"\n")
b64 = base64.b64encode(script).decode()
remote_cmd = f"echo {b64} | base64 -d > /tmp/add_root_blocker_cron.sh && bash /tmp/add_root_blocker_cron.sh"
subprocess.run(
    ["ssh", "-o", "BatchMode=yes", "tanarit@172.25.41.121", remote_cmd],
    check=True,
)
