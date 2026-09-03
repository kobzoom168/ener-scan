#!/usr/bin/env python3
"""ดึง cost AI จาก OpenRouter API — v2 ตามสเปก Codex (3 ก.ย. 2026)
- enrichment มี retry: retryable (404/408/409/425/429/timeout/network/5xx) → pending + bounded backoff
  (ห้ามเขียน completed index) · permanent (400/401/403) → dead-letter พร้อม reason
- completed index เขียนเฉพาะ enrichment สำเร็จ · crash หลัง append ก่อน index → duplicate cost line
  เป็นไปได้ → **analysis ต้อง dedupe ด้วย genId เสมอ**
- counters ต่อรอบ: enriched/retryable/deadLetter/backlog/oldestPendingAgeSec (+alert เมื่อ backlog โต)
- low-credit → Telegram alert จริง (warning <$10 / critical <$5) แบบ honest dedupe:
  ส่งสำเร็จค่อย claim, ส่งล้ม retry รอบหน้า · ห้าม auto-top-up · ห้าม log key/suffix
"""
import fcntl, json, os, sys, time, urllib.request, urllib.parse
from datetime import datetime, timezone, timedelta

BASE = "/root/llm-usage"
IDX = os.path.join(BASE, ".cost-index")            # genIds ที่จบแล้ว (สำเร็จ หรือ dead-letter)
PEND = os.path.join(BASE, ".cost-pending.json")    # {genId: {attempts,next_ts,env,callSite,jobIdPrefix,accessSource,first_ts}}
DEAD = os.path.join(BASE, "cost-deadletter.jsonl")
ALERT_STATE = os.path.join(BASE, ".credit-alert.json")
LOCK = os.path.join(BASE, ".cost-lock")
KEYS = {"pro": "/root/ener-scan-pro/.env", "staging": "/root/ener-scan-staging/.env"}
ENER_SCAN_ENV = "/root/ener-scan-pro/.env"         # ที่อยู่ TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID
MAX_ENRICH_PER_RUN = 400
MAX_ATTEMPTS = 12                                   # backoff สูงสุด ~6 ชม. → เกินนี้ dead-letter "max_attempts"
BACKLOG_ALERT = 2000
OLDEST_ALERT_SEC = 24 * 3600
WARN_AT, CRIT_AT = 10.0, 5.0
ALERT_REPEAT_SEC = 24 * 3600

RETRYABLE = {404, 408, 409, 425, 429}
PERMANENT = {400, 401, 403}

def envval(path, name):
    try:
        for line in open(path):
            if line.startswith(name + "="):
                return line.split("=", 1)[1].strip()
    except Exception:
        pass
    return None

def http_get(url, key):
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {key}"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read())

def classify(e):
    """คืน ("retryable"|"permanent", reason) — ห้ามมีเนื้อ key ใน reason"""
    code = getattr(e, "code", None)
    if isinstance(code, int):
        if code in PERMANENT:
            return "permanent", f"http_{code}"
        if code in RETRYABLE or code >= 500:
            return "retryable", f"http_{code}"
        return "retryable", f"http_{code}"
    return "retryable", type(e).__name__  # timeout/network/URLError

def append_jsonl(path, obj):
    with open(path, "a") as f:
        f.write(json.dumps(obj, ensure_ascii=False) + "\n")
    os.chmod(path, 0o600)

def load_pending():
    try:
        return json.load(open(PEND))
    except Exception:
        return {}

def save_pending(p):
    tmp = PEND + ".tmp"
    json.dump(p, open(tmp, "w"))
    os.replace(tmp, PEND)
    os.chmod(PEND, 0o600)

def send_telegram(text):
    tok = envval(ENER_SCAN_ENV, "TELEGRAM_BOT_TOKEN")
    chat = envval(ENER_SCAN_ENV, "TELEGRAM_CHAT_ID")
    if not tok or not chat:
        return False
    try:
        data = urllib.parse.urlencode({"chat_id": chat, "text": text}).encode()
        req = urllib.request.Request(f"https://api.telegram.org/bot{tok}/sendMessage", data=data)
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read()).get("ok") is True
    except Exception:
        return False

def maybe_alert_credit(balance):
    level = "critical" if balance < CRIT_AT else "warning" if balance < WARN_AT else None
    if not level:
        return
    st = {}
    try:
        st = json.load(open(ALERT_STATE))
    except Exception:
        pass
    now = time.time()
    # honest dedupe: ข้ามเฉพาะเมื่อ "เคยส่งสำเร็จ" level เดิมภายใน 24 ชม. (critical เตือนซ้ำถี่กว่าไม่เป็นไร)
    if st.get("level") == level and now - float(st.get("sent_ts", 0)) < ALERT_REPEAT_SEC:
        return
    msg = ("🚨 [Ener] เครดิต OpenRouter วิกฤต" if level == "critical" else "⚠️ [Ener] เครดิต OpenRouter ต่ำ") + \
          f": เหลือ ${balance:.2f} (เตือนที่ <${CRIT_AT if level=='critical' else WARN_AT:.0f}) — เติมที่ openrouter.ai/settings/credits"
    if send_telegram(msg):
        json.dump({"level": level, "sent_ts": now}, open(ALERT_STATE, "w"))
        os.chmod(ALERT_STATE, 0o600)
    # ส่งล้ม = ไม่เขียน state → รอบหน้าลองใหม่เอง

def maybe_alert_backlog(backlog, oldest_age):
    if backlog < BACKLOG_ALERT and oldest_age < OLDEST_ALERT_SEC:
        return
    st = {}
    try:
        st = json.load(open(ALERT_STATE))
    except Exception:
        pass
    if time.time() - float(st.get("backlog_sent_ts", 0)) < ALERT_REPEAT_SEC:
        return
    if send_telegram(f"⚠️ [Ener] cost-pull backlog {backlog} รายการ / ค้างนานสุด {oldest_age//3600} ชม. — ตรวจ /root/llm-usage"):
        st["backlog_sent_ts"] = time.time()
        json.dump(st, open(ALERT_STATE, "w"))
        os.chmod(ALERT_STATE, 0o600)

def run(api=http_get, now_fn=time.time):
    os.makedirs(BASE, mode=0o700, exist_ok=True)
    lk = open(LOCK, "w")
    try:
        fcntl.flock(lk, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        return 0
    try:
        return _run_locked(api, now_fn)
    finally:
        fcntl.flock(lk, fcntl.LOCK_UN)
        lk.close()

def _run_locked(api, now_fn):
    nowdt = datetime.now(timezone.utc)
    costfile = os.path.join(BASE, f"cost-{nowdt.strftime('%Y-%m-%d')}.jsonl")
    keys = {e: envval(f, "OPENROUTER_API_KEY") for e, f in KEYS.items()}
    keys = {e: k for e, k in keys.items() if k}
    if not keys:
        return 1

    # 1) snapshot key usage + credits (+low-credit alert จริง)
    for envl, key in keys.items():
        try:
            d = api("https://openrouter.ai/api/v1/auth/key", key).get("data", {})
            append_jsonl(costfile, {"type": "key_usage", "ts": nowdt.isoformat(timespec="seconds"), "env": envl,
                                    "usage_daily": d.get("usage_daily"), "usage_weekly": d.get("usage_weekly"),
                                    "usage_monthly": d.get("usage_monthly")})
        except Exception as e:
            append_jsonl(costfile, {"type": "key_usage_error", "env": envl, "error": type(e).__name__})
    balance = None
    try:
        c = api("https://openrouter.ai/api/v1/credits", next(iter(keys.values()))).get("data", {})
        balance = float(c.get("total_credits", 0)) - float(c.get("total_usage", 0))
        append_jsonl(costfile, {"type": "credits", "ts": nowdt.isoformat(timespec="seconds"),
                                "balance": round(balance, 4), "low": balance < WARN_AT})
    except Exception as e:
        append_jsonl(costfile, {"type": "credits_error", "error": type(e).__name__})
    if balance is not None:
        maybe_alert_credit(balance)

    # 2) หา genId ใหม่จาก collector jsonl → pending
    done = set(open(IDX).read().split()) if os.path.exists(IDX) else set()
    pending = load_pending()
    now = now_fn()
    for d in (nowdt, nowdt - timedelta(days=1)):
        p = os.path.join(BASE, d.strftime("%Y-%m-%d") + ".jsonl")
        if not os.path.exists(p):
            continue
        for line in open(p):
            try:
                r = json.loads(line)
            except Exception:
                continue
            gid = r.get("genId") or r.get("generationId")
            if not gid or not str(gid).startswith("gen-") or gid in done or gid in pending:
                continue
            pending[gid] = {"attempts": 0, "next_ts": 0,
                            "env": r.get("env") or ("staging" if "staging" in r.get("c", "") else "pro"),
                            "callSite": r.get("callSite"), "jobIdPrefix": r.get("jobIdPrefix"),
                            "accessSource": r.get("accessSource"), "first_ts": now}

    # 3) enrich pending ที่ถึงคิว (bounded backoff) — index เฉพาะสำเร็จ/dead-letter
    stats = {"enriched": 0, "retryable": 0, "deadLetter": 0}
    due = [g for g, m in pending.items() if m["next_ts"] <= now][:MAX_ENRICH_PER_RUN]
    with open(IDX, "a") as idxf:
        for gid in due:
            m = pending[gid]
            key = keys.get(m["env"]) or next(iter(keys.values()))
            try:
                g = api(f"https://openrouter.ai/api/v1/generation?id={gid}", key).get("data", {})
                append_jsonl(costfile, {"type": "gen_cost", "genId": gid, "env": m["env"],
                                        "callSite": m["callSite"], "jobIdPrefix": m["jobIdPrefix"],
                                        "accessSource": m["accessSource"], "cost": g.get("total_cost"),
                                        "tokens_prompt": g.get("tokens_prompt"),
                                        "tokens_completion": g.get("tokens_completion"), "model": g.get("model")})
                idxf.write(gid + "\n")           # index หลัง append สำเร็จเท่านั้น
                del pending[gid]
                stats["enriched"] += 1
                time.sleep(0.12)
            except Exception as e:
                kind, reason = classify(e)
                if kind == "permanent" or m["attempts"] + 1 >= MAX_ATTEMPTS:
                    append_jsonl(DEAD, {"genId": gid, "env": m["env"], "callSite": m["callSite"],
                                        "reason": reason if kind == "permanent" else f"max_attempts:{reason}",
                                        "attempts": m["attempts"] + 1})
                    idxf.write(gid + "\n")       # terminal — ไม่ retry อีก
                    del pending[gid]
                    stats["deadLetter"] += 1
                else:
                    m["attempts"] += 1
                    m["next_ts"] = now + min(60 * (2 ** m["attempts"]), 6 * 3600)
                    stats["retryable"] += 1
    save_pending(pending)
    oldest_age = int(now - min((m["first_ts"] for m in pending.values()), default=now))
    append_jsonl(costfile, {"type": "pull_stats", "ts": nowdt.isoformat(timespec="seconds"), **stats,
                            "backlog": len(pending), "oldestPendingAgeSec": oldest_age})
    maybe_alert_backlog(len(pending), oldest_age)
    os.chmod(IDX, 0o600)
    return 0

# ---------- self-tests (Codex: 404/429/500/timeout/401/success/crash-duplicate) ----------
def selftest():
    import tempfile, urllib.error
    global BASE, IDX, PEND, DEAD, ALERT_STATE, LOCK, KEYS
    tmp = tempfile.mkdtemp()
    BASE, IDX = tmp, os.path.join(tmp, ".cost-index")
    PEND, DEAD = os.path.join(tmp, ".cost-pending.json"), os.path.join(tmp, "cost-deadletter.jsonl")
    ALERT_STATE, LOCK = os.path.join(tmp, ".alert"), os.path.join(tmp, ".lock")
    kf = os.path.join(tmp, "envf")
    open(kf, "w").write("OPENROUTER_API_KEY=k-test\n")
    KEYS = {"pro": kf}
    day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    def seed(gids):
        with open(os.path.join(tmp, f"{day}.jsonl"), "w") as f:
            for g in gids:
                f.write(json.dumps({"genId": g, "env": "pro", "callSite": "t", "c": "ener-scan-pro"}) + "\n")
    def herr(code):
        return urllib.error.HTTPError("u", code, "x", {}, None)
    def fake(responses):
        def api(url, key):
            if "auth/key" in url or "credits" in url:
                return {"data": {"total_credits": 100, "total_usage": 1}}
            gid = url.split("id=")[1]
            r = responses.get(gid)
            if isinstance(r, Exception):
                raise r
            return {"data": r}
        return api
    pend = load_pending
    # success + 404 retryable + 401 permanent + 429 + 500 + timeout
    seed(["gen-ok", "gen-404", "gen-401", "gen-429", "gen-500", "gen-tmo"])
    run(api=fake({"gen-ok": {"total_cost": 1}, "gen-404": herr(404), "gen-401": herr(401),
                  "gen-429": herr(429), "gen-500": herr(500), "gen-tmo": TimeoutError("t")}))
    idx = open(IDX).read().split()
    assert "gen-ok" in idx and "gen-401" in idx, "success+permanent เข้า index"
    for g in ("gen-404", "gen-429", "gen-500", "gen-tmo"):
        assert g not in idx and g in pend(), f"{g} ต้องอยู่ pending ไม่ใช่ index"
        assert pend()[g]["attempts"] == 1 and pend()[g]["next_ts"] > time.time()
    dead = [json.loads(l) for l in open(DEAD)]
    assert len(dead) == 1 and dead[0]["genId"] == "gen-401" and dead[0]["reason"] == "http_401"
    # retry สำเร็จหลัง backoff → ออกจาก pending เข้า index
    later = time.time() + 7 * 3600
    run(api=fake({"gen-404": {"total_cost": 2}, "gen-429": herr(429), "gen-500": herr(500), "gen-tmo": TimeoutError("t")}), now_fn=lambda: later)
    assert "gen-404" in open(IDX).read().split() and "gen-404" not in pend()
    assert pend()["gen-429"]["attempts"] == 2
    # crash-duplicate: append สำเร็จแต่ index ไม่ทัน → รอบหน้า enrich ซ้ำ = 2 cost lines → dedupe ด้วย genId
    with open(IDX, "w") as f:
        f.write("\n".join(g for g in idx if g != "gen-ok") + "\n")
    del_pending = load_pending(); del_pending.pop("gen-ok", None); save_pending(del_pending)
    run(api=fake({"gen-ok": {"total_cost": 1}, "gen-429": herr(429), "gen-500": herr(500), "gen-tmo": TimeoutError("t")}), now_fn=lambda: later)
    cost_lines = [json.loads(l) for f2 in sorted(os.listdir(tmp)) if f2.startswith("cost-") and f2.endswith(".jsonl") for l in open(os.path.join(tmp, f2)) if '"gen_cost"' in l]
    oks = [l for l in cost_lines if l["genId"] == "gen-ok"]
    assert len(oks) == 2, "crash-dup สร้าง 2 บรรทัดได้"
    assert len({l["genId"]: l for l in oks}) == 1, "analysis dedupe ด้วย genId เหลือ 1"
    # stats + ไม่มี key ใน output ไฟล์ใด ๆ
    allout = "".join(open(os.path.join(tmp, f2)).read() for f2 in os.listdir(tmp) if f2.endswith(".jsonl"))
    assert "k-test" not in allout, "ห้ามมี key ใน output"
    assert '"pull_stats"' in allout and '"backlog"' in allout
    print("SELFTEST_OK enriched/retry/dead/backoff/crash-dup/no-key ครบ")

if __name__ == "__main__":
    if "--selftest" in sys.argv:
        selftest()
        sys.exit(0)
    sys.exit(run())
