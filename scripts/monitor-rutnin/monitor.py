import os
import json
import hashlib
from datetime import datetime
from pathlib import Path
from ftplib import FTP

import requests
from dotenv import load_dotenv

from ftp_listing_diff import diff_listings, has_changes

load_dotenv()

FTP_HOST = os.getenv("FTP_HOST")
FTP_USER = os.getenv("FTP_USER")
FTP_PASSWORD = os.getenv("FTP_PASSWORD")

LINE_TOKEN = os.getenv("LINE_CHANNEL_ACCESS_TOKEN")
GROUP_ID = os.getenv("LINE_GROUP_ID")

DATA_DIR = os.getenv("LOCAL_DATA_DIR", "./data")

Path(DATA_DIR).mkdir(parents=True, exist_ok=True)

STATE_FILE = os.path.join(DATA_DIR, "ftp_state.json")

MAX_ROWS = 20


def log(msg):
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {msg}", flush=True)


def get_ftp_listing():
    ftp = FTP()
    ftp.connect(FTP_HOST, 21, timeout=30)
    ftp.login(FTP_USER, FTP_PASSWORD)

    lines = []
    ftp.retrlines("LIST", lines.append)

    ftp.quit()

    return sorted(lines)


def calc_hash(lines):
    content = "\n".join(lines)
    return hashlib.sha256(content.encode()).hexdigest()


def _entry_icon(kind: str) -> str:
    if kind == "directory":
        return "📁"
    if kind == "symlink":
        return "🔗"
    return "📄"


def _format_change_item(item: dict) -> str:
    icon = _entry_icon(item["kind"])
    return (
        f"{icon} {item['name']} ({item['kind']}, {item['size']} bytes, {item['mtime']})"
    )


def _format_modified_item(item: dict) -> str:
    icon = _entry_icon(item["kind"])
    detail = "; ".join(item["changes"])
    return f"{icon} {item['name']} ({item['kind']}) - {detail}"


def build_flex(diff: dict):
    today = datetime.now().strftime("%Y-%m-%d")
    timehm = datetime.now().strftime("%H:%M")

    added = diff["added"]
    removed = diff["removed"]
    modified = diff["modified"]

    header = {
        "type": "box",
        "layout": "vertical",
        "paddingAll": "md",
        "paddingTop": "sm",
        "paddingBottom": "sm",
        "contents": [
            {"type": "text", "text": "FTP Change Alert", "weight": "bold", "size": "sm", "color": "#ffffff"},
            {"type": "text", "text": "rutnin.com", "size": "xs", "color": "#cbd5f5"},
            {"type": "text", "text": f"{today} time {timehm}", "size": "xxs", "color": "#9ca3af"},
        ],
    }

    def text_rows(lines, color):
        return [
            {"type": "text", "text": line, "size": "xxs", "wrap": True, "color": color}
            for line in lines[:MAX_ROWS]
        ]

    body_contents = []

    if added:
        body_contents.append(
            {
                "type": "text",
                "text": f"Added ({len(added)})",
                "size": "xs",
                "weight": "bold",
                "color": "#4ade80",
                "margin": "md",
            }
        )
        body_contents.extend(text_rows([_format_change_item(item) for item in added], "#e5e7eb"))

    if removed:
        body_contents.append(
            {
                "type": "text",
                "text": f"Removed ({len(removed)})",
                "size": "xs",
                "weight": "bold",
                "color": "#f87171",
                "margin": "md",
            }
        )
        body_contents.extend(text_rows([_format_change_item(item) for item in removed], "#e5e7eb"))

    if modified:
        body_contents.append(
            {
                "type": "text",
                "text": f"Modified ({len(modified)})",
                "size": "xs",
                "weight": "bold",
                "color": "#fbbf24",
                "margin": "md",
            }
        )
        body_contents.extend(
            text_rows([_format_modified_item(item) for item in modified], "#e5e7eb")
        )

    body = {
        "type": "box",
        "layout": "vertical",
        "spacing": "xs",
        "paddingAll": "md",
        "paddingTop": "xs",
        "paddingBottom": "sm",
        "contents": body_contents,
    }

    footer_parts = [
        {"type": "text", "text": f"Added: {len(added)}", "size": "xxs", "color": "#4ade80", "weight": "bold", "flex": 1},
        {"type": "text", "text": f"Removed: {len(removed)}", "size": "xxs", "color": "#f87171", "weight": "bold", "align": "end", "flex": 1},
    ]
    if modified:
        footer_parts = [
            {"type": "text", "text": f"Added: {len(added)}", "size": "xxs", "color": "#4ade80", "weight": "bold", "flex": 1},
            {"type": "text", "text": f"Removed: {len(removed)}", "size": "xxs", "color": "#f87171", "weight": "bold", "flex": 1},
            {"type": "text", "text": f"Modified: {len(modified)}", "size": "xxs", "color": "#fbbf24", "weight": "bold", "flex": 1},
        ]

    footer = {
        "type": "box",
        "layout": "vertical",
        "paddingAll": "md",
        "paddingTop": "xs",
        "paddingBottom": "xs",
        "spacing": "sm",
        "contents": [
            {"type": "box", "layout": "baseline", "contents": footer_parts},
            {"type": "separator", "color": "#334155"},
            {
                "type": "text",
                "text": "FTP listing changed - please check site files",
                "size": "xxs",
                "color": "#9ca3af",
                "wrap": True,
            },
        ],
    }

    return {
        "type": "bubble",
        "header": header,
        "body": body,
        "footer": footer,
        "styles": {
            "header": {"backgroundColor": "#020617"},
            "body": {"backgroundColor": "#020617"},
            "footer": {"backgroundColor": "#020617"},
        },
    }


def send_line_flex(flex_contents, alt_text):
    headers = {
        "Authorization": f"Bearer {LINE_TOKEN}",
        "Content-Type": "application/json",
    }

    payload = {
        "to": GROUP_ID,
        "messages": [
            {
                "type": "flex",
                "altText": alt_text,
                "contents": flex_contents,
            }
        ],
    }

    r = requests.post(
        "https://api.line.me/v2/bot/message/push",
        headers=headers,
        json=payload,
        timeout=30,
    )

    log(f"LINE: {r.status_code}")
    log(r.text)


current_listing = get_ftp_listing()
current_hash = calc_hash(current_listing)

current_state = {
    "hash": current_hash,
    "listing": current_listing,
}

if not os.path.exists(STATE_FILE):
    with open(STATE_FILE, "w") as f:
        json.dump(current_state, f, indent=2)

    log("baseline created")
    raise SystemExit(0)

with open(STATE_FILE) as f:
    old_state = json.load(f)

if old_state["hash"] != current_hash:
    diff = diff_listings(old_state["listing"], current_listing)

    if has_changes(diff):
        flex = build_flex(diff)
        send_line_flex(flex, "rutnin.com FTP Changed")

        with open(STATE_FILE, "w") as f:
            json.dump(current_state, f, indent=2)

        log(
            "changed: "
            f"added={len(diff['added'])} "
            f"removed={len(diff['removed'])} "
            f"modified={len(diff['modified'])}"
        )
    else:
        with open(STATE_FILE, "w") as f:
            json.dump(current_state, f, indent=2)
        log("hash changed but no file-level diff (listing order only)")
else:
    log("no change")
