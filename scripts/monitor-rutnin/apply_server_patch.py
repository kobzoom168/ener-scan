#!/usr/bin/env python3
"""Rewrite monitor.py using existing credentials + filename-based FTP diff."""

from __future__ import annotations

import re
import shutil
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent
MONITOR = ROOT / "monitor.py"
BACKUP = ROOT / "monitor.py.bak"

MONITOR_TEMPLATE = '''#!/usr/bin/env python3
"""FTP listing monitor for {domain}."""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime
from ftplib import FTP
from pathlib import Path

import requests

from ftp_listing_diff import (
    build_discord_fields,
    build_summary_footer,
    diff_listings,
    has_changes,
)

ROOT = Path(__file__).resolve().parent
SNAPSHOT = ROOT / {snapshot!r}
DOMAIN = {domain!r}
FTP_HOST = {ftp_host!r}
FTP_USER = {ftp_user!r}
FTP_PASS = {ftp_pass!r}
FTP_DIR = {ftp_dir!r}
DISCORD_WEBHOOK = {discord_webhook!r}


def load_listing() -> list[str]:
    with FTP(FTP_HOST) as ftp:
        ftp.login(FTP_USER, FTP_PASS)
        if FTP_DIR:
            ftp.cwd(FTP_DIR)
        lines: list[str] = []
        ftp.retrlines("LIST", lines.append)
    return lines


def read_snapshot() -> list[str]:
    if not SNAPSHOT.exists():
        return []
    return SNAPSHOT.read_text(encoding="utf-8").splitlines()


def write_snapshot(lines: list[str]) -> None:
    SNAPSHOT.write_text("\\n".join(lines) + ("\\n" if lines else ""), encoding="utf-8")


def send_discord_alert(diff: dict) -> None:
    now = datetime.now().strftime("%Y-%m-%d time %H:%M")
    fields = build_discord_fields(diff)
    footer = build_summary_footer(diff)

    embed = {{
        "title": "FTP Change Alert",
        "description": f"**Domain:** {{DOMAIN}}\\n**Timestamp:** {{now}}",
        "color": 16744272,
        "fields": fields,
        "footer": {{"text": footer[:2048]}},
    }}

    response = requests.post(
        DISCORD_WEBHOOK,
        json={{"embeds": [embed]}},
        timeout=30,
    )
    response.raise_for_status()


def main() -> int:
    current = load_listing()
    previous = read_snapshot()

    if not previous:
        write_snapshot(current)
        print("Initial snapshot saved.")
        return 0

    diff = diff_listings(previous, current)
    if has_changes(diff):
        send_discord_alert(diff)
        print(
            "Alert sent:",
            f"added={{len(diff['added'])}}",
            f"removed={{len(diff['removed'])}}",
            f"modified={{len(diff['modified'])}}",
        )
    else:
        print("No changes.")

    write_snapshot(current)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"ERROR: {{exc}}", file=sys.stderr)
        raise
'''


def _pick(
    patterns: list[str], text: str, label: str, default: str | None = None
) -> str:
    for pattern in patterns:
        match = re.search(pattern, text, re.MULTILINE | re.DOTALL)
        if match:
            if match.lastindex:
                return match.group(1)
            return match.group(0)
    if default is not None:
        return default
    raise ValueError(f"Could not find {label} in monitor.py")


def extract_config(source: str) -> dict[str, str]:
    return {
        "domain": _pick(
            [r'DOMAIN\s*=\s*["\']([^"\']+)["\']', r'rutnin\.com'],
            source,
            "domain",
            default="rutnin.com",
        ),
        "ftp_host": _pick(
            [
                r'FTP_HOST\s*=\s*["\']([^"\']+)["\']',
                r'host\s*=\s*["\']([^"\']+)["\']',
                r'FTP\s*\(\s*["\']([^"\']+)["\']',
            ],
            source,
            "ftp_host",
            default="rutnin.com",
        ),
        "ftp_user": _pick(
            [
                r'FTP_USER\s*=\s*["\']([^"\']+)["\']',
                r'login\s*\(\s*["\']([^"\']+)["\']',
                r'ftp\.login\s*\(\s*["\']([^"\']+)["\']',
            ],
            source,
            "ftp_user",
            default="qpc",
        ),
        "ftp_pass": _pick(
            [
                r'FTP_PASS(?:WORD)?\s*=\s*["\']([^"\']+)["\']',
                r'login\s*\(\s*["\'][^"\']+["\']\s*,\s*["\']([^"\']+)["\']',
                r'ftp\.login\s*\(\s*["\'][^"\']+["\']\s*,\s*["\']([^"\']+)["\']',
            ],
            source,
            "ftp_pass",
        ),
        "ftp_dir": _pick(
            [
                r'FTP_DIR(?:ECTORY)?\s*=\s*["\']([^"\']*)["\']',
                r'cwd\s*\(\s*["\']([^"\']*)["\']',
            ],
            source,
            "ftp_dir",
            default="",
        ),
        "discord_webhook": _pick(
            [
                r'DISCORD_WEBHOOK\s*=\s*["\']([^"\']+)["\']',
                r'WEBHOOK(?:_URL)?\s*=\s*["\']([^"\']+)["\']',
                r'https://discord(?:app)?\.com/api/webhooks/[^\s"\']+',
            ],
            source,
            "discord_webhook",
        ),
        "snapshot": _pick(
            [
                r'SNAPSHOT\s*=\s*["\']([^"\']+)["\']',
                r'last_listing\.txt',
            ],
            source,
            "snapshot",
            default="last_listing.txt",
        ),
    }


def load_env_overrides() -> dict[str, str]:
    env_file = ROOT / ".env"
    if not env_file.exists():
        return {}

    overrides: dict[str, str] = {}
    for line in env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        overrides[key.strip().upper()] = value.strip().strip('"').strip("'")
    return overrides


def merge_env(config: dict[str, str], env: dict[str, str]) -> dict[str, str]:
    mapping = {
        "DOMAIN": "domain",
        "FTP_HOST": "ftp_host",
        "FTP_USER": "ftp_user",
        "FTP_PASS": "ftp_pass",
        "FTP_PASSWORD": "ftp_pass",
        "FTP_DIR": "ftp_dir",
        "DISCORD_WEBHOOK": "discord_webhook",
        "WEBHOOK_URL": "discord_webhook",
        "SNAPSHOT": "snapshot",
    }
    merged = dict(config)
    for env_key, config_key in mapping.items():
        if env_key in env and env[env_key]:
            merged[config_key] = env[env_key]
    return merged


def already_patched(source: str) -> bool:
    return "from ftp_listing_diff import" in source and "diff_listings(" in source


def patch() -> None:
    if not MONITOR.exists():
        raise SystemExit(f"Missing {MONITOR}")

    original = MONITOR.read_text(encoding="utf-8")
    if already_patched(original):
        print("monitor.py already patched.")
        return

    if not BACKUP.exists():
        shutil.copy2(MONITOR, BACKUP)
        print(f"Backup saved to {BACKUP.name}")

    config = merge_env(extract_config(original), load_env_overrides())
    new_source = MONITOR_TEMPLATE.format(**config)
    MONITOR.write_text(new_source, encoding="utf-8")
    print("monitor.py rewritten with filename-based diff alerts.")


if __name__ == "__main__":
    patch()
