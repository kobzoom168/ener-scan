#!/usr/bin/env python3
"""LLM telemetry collector v2 (Codex spec, 3 ก.ย. 2026) — read-only ต่อ production
- flock กัน cron ซ้อน · cursor แยกตาม container ID (recreate = ID ใหม่ = เริ่มอ่านตั้งแต่ต้น log ใหม่อย่างปลอดภัย)
- docker logs --timestamps อ่านต่อจาก cursor (ns precision) ไม่มี overlap
- JSONL 1 object/บรรทัด · field whitelist เท่านั้น (ไม่มีข้อความลูกค้า/prompt/UID เต็ม/secret)
- stable event key: genId ถ้ามี ไม่งั้น sha1(containerID|ts|event|เนื้อ jsonย่อ)
- atomic cursor write หลัง append สำเร็จ · chmod 600 · retention 30 วัน + disk cap 200MB
"""
import fcntl, hashlib, json, os, re, subprocess, sys, time
from datetime import datetime, timezone

BASE = "/root/llm-usage"
CURS = os.path.join(BASE, ".cursors")
LOCK = os.path.join(BASE, ".lock")
EVENT_RE = re.compile(
    r"LLM_USAGE|OBJECT_SAME_IDENTITY_VERIFIER_(RESULT|ACCEPTED)|"
    r"CROSS_ACCOUNT_BASELINE_EMBEDDING_REUSE_(HIT|SKIPPED)|VISION_REID_[A-Z_]+")
# whitelist กัน PII/prompt/secret หลุด — คีย์นอกลิสต์ถูกทิ้งเสมอ (คง *Prefix ที่ตัดแล้วเท่านั้น)
ALLOW = {
    "event","api","callSite","model","promptTokens","cachedTokens","completionTokens",
    "genId","generationId","latencyMs","ok","env","jobIdPrefix","accessSource","attempt",
    "candidateCount","candidateRank","decisionPath","contextReason","reason",
    "candidateIdPrefix","verifierEnabled","same","confidence",  # P1 Codex: ไม่เก็บ lineUserIdPrefix
    "matchCount","inliers","similarity","count","source","verdict","scanIdPrefix",
    "poolSize","recallSource","path","rawMatches","acceptInliers","arbiterMin",
    "failureType","provider","promptChars",
}
SECRET_RE = re.compile(r"sk-or-v1-[A-Za-z0-9]+|Bearer [A-Za-z0-9._-]+")
TS_RE = re.compile(r"^(\d{4}-\d{2}-\d{2}T[0-9:.]+Z)\s")

def sh(args):
    return subprocess.run(args, capture_output=True, text=True, timeout=120).stdout

def containers():
    out = sh(["docker","ps","--format","{{.ID}} {{.Names}}"])
    for line in out.splitlines():
        cid, _, name = line.partition(" ")
        if re.match(r"^ener-scan(-pro|-staging)?(-worker-[a-z]+)?$", name.strip()):
            yield cid.strip(), name.strip()

def sanitize(obj):
    out = {}
    for k, v in obj.items():
        if k not in ALLOW:
            continue
        if isinstance(v, str):
            v = SECRET_RE.sub("[redacted]", v)[:120]
        out[k] = v
    return out

def main():
    os.makedirs(BASE, mode=0o700, exist_ok=True)
    os.makedirs(CURS, mode=0o700, exist_ok=True)
    lk = open(LOCK, "w")
    try:
        fcntl.flock(lk, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        return 0  # รอบก่อนยังรันอยู่ — ข้ามเงียบ ๆ (cursor กันข้อมูลหาย)
    day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    outpath = os.path.join(BASE, f"{day}.jsonl")
    live_ids = set()
    for cid, name in containers():
        live_ids.add(cid)
        curpath = os.path.join(CURS, cid)
        since = None
        if os.path.exists(curpath):
            since = open(curpath).read().strip() or None
        cmd = ["docker","logs","--timestamps"] + (["--since", since] if since else []) + [cid]
        try:
            raw = sh(cmd)
        except Exception:
            continue
        rows, last_ts = [], since
        for line in raw.splitlines():
            m = TS_RE.match(line)
            if not m:
                continue
            ts = m.group(1)
            if since and ts <= since:   # --since inclusive ที่ขอบ — กันซ้ำ
                continue
            if not EVENT_RE.search(line):
                if last_ts is None or ts > last_ts: last_ts = ts
                continue
            jstart = line.find("{")
            payload = {}
            if jstart >= 0:
                try: payload = json.loads(line[jstart:])
                except Exception: payload = {"event": "unparsed"}
            clean = sanitize(payload)
            gid = clean.get("genId") or clean.get("generationId")
            key = gid or hashlib.sha1(f"{cid}|{ts}|{clean.get('event','')}|{json.dumps(clean,sort_keys=True)}".encode()).hexdigest()[:16]
            rows.append({"k": key, "ts": ts, "c": name, **clean})
            if last_ts is None or ts > last_ts: last_ts = ts
        if rows:
            with open(outpath, "a") as f:
                for r in rows:
                    f.write(json.dumps(r, ensure_ascii=False) + "\n")
                f.flush(); os.fsync(f.fileno())
            os.chmod(outpath, 0o600)
        if last_ts:  # atomic cursor update หลัง append สำเร็จเท่านั้น
            tmp = curpath + ".tmp"
            with open(tmp, "w") as f: f.write(last_ts)
            os.replace(tmp, curpath)
    # ล้าง cursor ของ container ที่หายไป (recreate/ลบ)
    for f in os.listdir(CURS):
        if not f.endswith(".tmp") and f not in live_ids:
            os.remove(os.path.join(CURS, f))
    # retention 30 วัน + disk cap 200MB (ลบเก่าสุดก่อน)
    files = sorted(f for f in os.listdir(BASE) if f.endswith(".jsonl"))
    now = time.time()
    for f in list(files):
        p = os.path.join(BASE, f)
        if now - os.path.getmtime(p) > 30*86400:
            os.remove(p); files.remove(f)
    while sum(os.path.getsize(os.path.join(BASE,f)) for f in files) > 200*1024*1024 and len(files) > 1:
        os.remove(os.path.join(BASE, files.pop(0)))
    return 0

def selftest():
    """P1 Codex: payload มี UID เต็ม/prompt/Bearer/key → output ต้องไม่มีค่าเหล่านั้น"""
    dirty = {
        "event": "LLM_USAGE", "callSite": "deepScan", "ok": True,
        "lineUserId": "U" + "a" * 32, "lineUserIdPrefix": "Uabcdefg",
        "prompt": "ข้อความลูกค้าลับสุดยอด", "systemPrompt": "secret sys",
        "error": "Bearer abc.def sk-or-v1-deadbeef1234 body",
        "jobIdPrefix": "job12345", "accessSource": "paid",
    }
    out = json.dumps(sanitize(dirty), ensure_ascii=False)
    for bad in ("U" + "a" * 32, "Uabcdefg", "ลับสุดยอด", "secret sys", "sk-or-v1-deadbeef1234", "Bearer abc"):
        assert bad not in out, f"PII/secret หลุด: {bad}"
    assert '"jobIdPrefix": "job12345"' in out and '"accessSource": "paid"' in out
    print("SELFTEST_OK " + out)

if __name__ == "__main__":
    if "--selftest" in sys.argv:
        selftest()
        sys.exit(0)
    sys.exit(main())
