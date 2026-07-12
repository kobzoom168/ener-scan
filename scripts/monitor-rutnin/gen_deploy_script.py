#!/usr/bin/env python3
import base64
from pathlib import Path

ROOT = Path(__file__).resolve().parent
files = {
    "ftp_listing_diff.py": (ROOT / "ftp_listing_diff.py").read_bytes(),
    "apply_server_patch.py": (ROOT / "apply_server_patch.py").read_bytes(),
}

lines = [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    'DIR="/home/tanarit/monitor-rutnin.com"',
    'cd "$DIR"',
    "",
]

for name, data in files.items():
    b64 = base64.b64encode(data).decode()
    lines += [
        f'echo "==> Writing {name}"',
        f"base64 -d > {name} <<'B64_EOF'",
        b64,
        "B64_EOF",
        "",
    ]

lines += [
    'cp monitor.py monitor.py.bak.$(date +%Y%m%d_%H%M%S) 2>/dev/null || true',
    "./venv/bin/python apply_server_patch.py",
    "./venv/bin/python -m py_compile monitor.py ftp_listing_diff.py",
    "./venv/bin/python monitor.py",
    'echo "==> Deploy OK"',
    "",
]

(ROOT / "deploy-on-server.sh").write_text("\n".join(lines), encoding="utf-8")
print("OK")
