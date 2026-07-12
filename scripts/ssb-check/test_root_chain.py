"""Simulate root-blocker chain logic for the 17-06-2025 Excel case."""
from __future__ import annotations

# (spid, blocked_by, waittime, hostname, program)
SESSIONS = [
    (100, 0, 0, "ITPC67119", "SSBOPD Application"),      # root - sleeping
    (127, 100, 5000, "dms-web1", ""),                    # blocked by 100
    (101, 127, 15000, "ITPC67013", "SSBOPD Application"),
    (51, 127, 8000, "dms-web1", ""),
    (215, 127, 15854, "ITPC67097", "SSBOPD Application"),
]

MIN_WAIT_MS = 3000


def find_roots(sessions, min_wait_ms=MIN_WAIT_MS):
    blocked = {
        spid: {
            "blocking_session_id": blk,
            "waittime": wait,
            "hostname": host,
            "program_name": prog,
        }
        for spid, blk, wait, host, prog in sessions
        if blk not in (0, spid) and wait > min_wait_ms
    }

    # Walk chain up from each victim
    chains = []
    for victim, info in blocked.items():
        head = info["blocking_session_id"]
        seen = {victim}
        while head in {s for s, b, *_ in sessions if b not in (0, s)}:
            if head in seen:
                break
            seen.add(head)
            nxt = blocked.get(head)
            if not nxt:
                break
            head = nxt["blocking_session_id"]
        chains.append((victim, head))

    roots = {}
    for victim, head in chains:
        roots.setdefault(head, set()).add(victim)

    meta = {spid: (host, prog) for spid, _, _, host, prog in sessions}
    return roots, meta, blocked


roots, meta, blocked = find_roots(SESSIONS)
print("blocked victims (wait > 3s):", sorted(blocked))
print("roots:", {k: len(v) for k, v in roots.items()})
for head, victims in roots.items():
    host, prog = meta[head]
    print(f"ROOT SPID={head} host={host} prog={prog} total_blocked={len(victims)}")

assert 100 in roots
assert 127 not in roots
print("OK: root is SPID 100, not 127")
