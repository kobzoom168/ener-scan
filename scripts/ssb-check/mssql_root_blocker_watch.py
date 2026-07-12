#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
MSSQL Root Blocker Watch
- หา session ต้นทาง (root blocker) ที่ block คนอื่น
- แสดง host / program / SPID / จำนวนที่โดน block
- ส่ง LINE Flex เมื่อ SEND_LINE=1 ใน .env
- ไม่ kill session (monitor อย่างเดียว)
"""

from __future__ import annotations

import os
from datetime import datetime

import pyodbc
import requests

LINE_TOKEN = os.getenv("LINE_CHANNEL_TOKEN", "")
LINE_TO = os.getenv("LINE_TO", "")
SEND_LINE = os.getenv("SEND_LINE", "0") == "1"

SQL_DSN = "sql41"
SQL_DB = "master"
SQL_USER = os.getenv("SQL_USER", "sys_monitor")
SQL_PASS = os.getenv("SQL_PASS", "")
TDS_VER = os.getenv("TDS_VERSION", "7.3")

MIN_WAIT_MS = int(os.getenv("ROOT_BLOCK_MIN_WAIT_MS", "3000"))
MAX_ROOTS = int(os.getenv("ROOT_BLOCK_MAX_ROOTS", "5"))
MAX_VICTIMS = int(os.getenv("ROOT_BLOCK_MAX_VICTIMS", "5"))

ROOT_QUERY = """
;WITH blocked AS (
    SELECT
        spid AS session_id,
        blocked AS blocking_session_id,
        waittime,
        lastwaittype,
        hostname,
        program_name,
        loginame,
        status,
        cmd,
        last_batch,
        DB_NAME(dbid) AS database_name
    FROM sys.sysprocesses
    WHERE blocked <> 0
      AND blocked <> spid
      AND waittime > ?
),
block_chain AS (
    SELECT
        b.session_id AS victim_session_id,
        b.blocking_session_id,
        b.blocking_session_id AS head_session_id,
        1 AS chain_level
    FROM blocked b
    UNION ALL
    SELECT
        bc.victim_session_id,
        p.blocking_session_id,
        p.blocking_session_id,
        bc.chain_level + 1
    FROM block_chain bc
    INNER JOIN blocked p ON bc.head_session_id = p.session_id
    WHERE bc.chain_level < 20
),
roots AS (
    SELECT DISTINCT head_session_id
    FROM block_chain
    WHERE head_session_id NOT IN (SELECT session_id FROM blocked)
),
root_stats AS (
    SELECT
        r.head_session_id,
        COUNT(DISTINCT bc.victim_session_id) AS total_blocked,
        MAX(b.waittime) AS max_wait_ms
    FROM roots r
    JOIN block_chain bc ON bc.head_session_id = r.head_session_id
    JOIN blocked b ON b.session_id = bc.victim_session_id
    GROUP BY r.head_session_id
)
SELECT TOP {max_roots}
    rs.head_session_id,
    rs.total_blocked,
    rs.max_wait_ms,
    s.hostname,
    s.program_name,
    s.loginame,
    s.status,
    s.cmd,
    s.last_batch,
    DB_NAME(s.dbid) AS database_name
FROM root_stats rs
JOIN sys.sysprocesses s ON s.spid = rs.head_session_id
ORDER BY rs.total_blocked DESC, rs.max_wait_ms DESC;
""".format(max_roots=MAX_ROOTS)

VICTIMS_QUERY = """
SELECT TOP {max_victims}
    spid,
    hostname,
    program_name,
    loginame,
    waittime,
    lastwaittype,
    status,
    cmd,
    DB_NAME(dbid) AS database_name
FROM sys.sysprocesses
WHERE blocked = ?
  AND blocked <> spid
  AND waittime > ?
ORDER BY waittime DESC;
""".format(max_victims=MAX_VICTIMS)


def log(msg: str) -> None:
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {msg}", flush=True)


def get_conn():
    conn_str = (
        "DRIVER={FreeTDS};"
        f"Servername={SQL_DSN};"
        f"DATABASE={SQL_DB};"
        f"UID={SQL_USER};PWD={SQL_PASS};"
        f"TDS_Version={TDS_VER};"
        "ClientCharset=UTF-8;"
    )
    return pyodbc.connect(conn_str, timeout=8)


def _program_short(program: str) -> str:
    if not program or program == "-":
        return "Unknown"
    return program.split(" (")[0].strip() or "Unknown"


def send_flex(roots: list[dict]) -> None:
    if not (SEND_LINE and LINE_TOKEN and LINE_TO):
        log("[LINE] token/target not set; skip")
        return

    color = "#8B0000"
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    body: list[dict] = [
        {
            "type": "text",
            "text": "🚨 SSB DB ROOT BLOCKER",
            "weight": "bold",
            "size": "lg",
            "color": "#FFFFFF",
        },
        {"type": "separator", "margin": "md"},
        {
            "type": "text",
            "text": ts,
            "size": "xs",
            "color": "#DDDDDD",
        },
        {
            "type": "text",
            "text": f"Found {len(roots)} root blocker(s)",
            "size": "sm",
            "color": "#FFFFFF",
        },
    ]

    for index, root in enumerate(roots, start=1):
        host = root["hostname"]
        program = _program_short(root["program_name"])
        spid = root["head_session_id"]
        blocked_total = root["total_blocked"]
        max_wait = root["max_wait_ms"]

        if index > 1:
            body.append({"type": "separator", "margin": "md"})

        body.append(
            {
                "type": "text",
                "text": f"Root Blocker #{index}:",
                "weight": "bold",
                "size": "sm",
                "color": "#FFFFFF",
            }
        )
        body.append(
            {
                "type": "text",
                "text": f"• {host} | {program}",
                "size": "sm",
                "wrap": True,
                "color": "#FFFFFF",
            }
        )
        body.append(
            {
                "type": "text",
                "text": (
                    f"  ROOT SPID {spid} | blocked {blocked_total} | "
                    f"max wait {max_wait} ms"
                ),
                "size": "xs",
                "wrap": True,
                "color": "#FFFFFF",
            }
        )
        body.append(
            {
                "type": "text",
                "text": (
                    f"  status {root['status']} | login {root['loginame']} | "
                    f"db {root['database_name']}"
                ),
                "size": "xs",
                "wrap": True,
                "color": "#FFFFFF",
            }
        )
        body.append(
            {
                "type": "text",
                "text": f"  last_batch {root['last_batch']}",
                "size": "xs",
                "wrap": True,
                "color": "#FFFFFF",
            }
        )

        victims = root.get("victims") or []
        if victims:
            body.append(
                {
                    "type": "text",
                    "text": "Direct victims:",
                    "weight": "bold",
                    "size": "sm",
                    "color": "#FFFFFF",
                    "margin": "md",
                }
            )
            for victim in victims:
                victim_program = _program_short(victim["program_name"])
                body.append(
                    {
                        "type": "text",
                        "text": f"• {victim['hostname']} | {victim_program}",
                        "size": "sm",
                        "wrap": True,
                        "color": "#FFFFFF",
                    }
                )
                body.append(
                    {
                        "type": "text",
                        "text": (
                            f"  SPID {victim['spid']} | wait {victim['waittime']} ms | "
                            f"{victim['lastwaittype']}"
                        ),
                        "size": "xs",
                        "wrap": True,
                        "color": "#FFFFFF",
                    }
                )

    payload = {
        "to": LINE_TO,
        "messages": [
            {
                "type": "flex",
                "altText": "SSB DB ROOT BLOCKER",
                "contents": {
                    "type": "bubble",
                    "body": {
                        "type": "box",
                        "layout": "vertical",
                        "backgroundColor": color,
                        "contents": body,
                    },
                },
            }
        ],
    }

    try:
        response = requests.post(
            "https://api.line.me/v2/bot/message/push",
            headers={
                "Authorization": f"Bearer {LINE_TOKEN}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=10,
        )
        log(f"[LINE FLEX] {response.status_code} {response.text[:150]}")
    except Exception as exc:
        log(f"[LINE FLEX ERROR] {exc}")


def fmt_root(root: dict) -> str:
    victims = root.get("victims") or []
    victim_text = "; ".join(
        f"spid={v['spid']} {v['hostname']} {v['program_name']} wait={v['waittime']}ms"
        for v in victims
    ) or "-"
    return (
        f"ROOT spid={root['head_session_id']} | host={root['hostname']} | "
        f"prog={root['program_name']} | login={root['loginame']} | status={root['status']} | "
        f"db={root['database_name']} | blocked_total={root['total_blocked']} | "
        f"max_wait={root['max_wait_ms']}ms | victims={victim_text}"
    )


def fetch_victims(cur, root_spid: int) -> list[dict]:
    cur.execute(VICTIMS_QUERY, (root_spid, MIN_WAIT_MS))
    rows = cur.fetchall()
    return [
        {
            "spid": row.spid,
            "hostname": row.hostname or "-",
            "program_name": (row.program_name or "-").strip() or "-",
            "loginame": row.loginame or "-",
            "waittime": row.waittime,
            "lastwaittype": row.lastwaittype or "-",
            "status": row.status or "-",
            "cmd": row.cmd or "-",
            "database_name": row.database_name or "-",
        }
        for row in rows
    ]


def main() -> None:
    try:
        with get_conn() as conn:
            cur = conn.cursor()
            cur.execute(ROOT_QUERY, (MIN_WAIT_MS,))
            rows = cur.fetchall()
            roots: list[dict] = []
            for row in rows:
                root = {
                    "head_session_id": row.head_session_id,
                    "total_blocked": row.total_blocked,
                    "max_wait_ms": row.max_wait_ms,
                    "hostname": row.hostname or "-",
                    "program_name": (row.program_name or "-").strip() or "-",
                    "loginame": row.loginame or "-",
                    "status": row.status or "-",
                    "cmd": row.cmd or "-",
                    "last_batch": row.last_batch,
                    "database_name": row.database_name or "-",
                    "victims": fetch_victims(cur, row.head_session_id),
                }
                roots.append(root)
    except pyodbc.Error as exc:
        log(f"SQL ERROR: {exc}")
        return
    except Exception as exc:
        log(f"ERROR: {exc}")
        return

    if not roots:
        log("No root blockers.")
        return

    log(f"Found {len(roots)} root blocker(s)")
    for root in roots:
        log(fmt_root(root))

    if SEND_LINE:
        send_flex(roots)


if __name__ == "__main__":
    main()
