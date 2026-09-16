#!/usr/bin/env python3
"""Cost Check รอบล่าสุด — read-only (Codex spec 16 ก.ย. 2026)

รวม collector LLM_USAGE + cost puller gen_cost + jobs.csv → ต้นทุน AI ต่อหน้าต่างเวลา (Asia/Bangkok)
ไม่แตะ DB/AI/LINE · ไม่มี network · dedupe ด้วย event key + genId · ตัด test UID · แยก env ตาม key

ใช้: python3 cost_check_latest.py <usage-dir> <jobs.csv> <A_from> <A_to> <B_from> <B_to> [--rate 36]
jobs.csv: prefix8,dateTH,accessSource,status,is_test,delivered_evidence
"""
import csv, json, os, sys
from collections import defaultdict
from datetime import datetime, timedelta, timezone

TH = timezone(timedelta(hours=7))
SCAN_PREFIX = ("objectCheck", "deepScan", "stableFeatureExtract", "objectEmbedding",
               "imageForensic", "objectSameIdentityVerifier", "smartRejection", "objectInfoParse")
CONTENT = {"voiceScript", "fbCaption", "ytShortCaption", "synergyReport", "reportEnglish"}
MONITOR = {"chatQuality", "chatQualityCurate", "smoke.telemetryCheck"}
CHAT = {"planner", "consult", "phrasing", "semanticCatcher", "stateSafeClarifier", "hybridPersona"}
PAYMENT_PREFIX = ("slip",)

def bucket(cs):
    if cs in CONTENT: return "content"
    if cs in MONITOR: return "monitoring"
    if cs in CHAT: return "chat"
    if cs.startswith(PAYMENT_PREFIX): return "payment"
    if any(cs.startswith(p) for p in SCAN_PREFIX): return "scan"
    return "other"

def th_day(ts):
    try:
        return datetime.fromisoformat(str(ts).replace("Z", "+00:00")).astimezone(TH).strftime("%Y-%m-%d")
    except Exception:
        return None

def load_events(d):
    usage, keyusage, costs = [], [], {}
    seen_k, seen_g, dupk, dupg = set(), set(), 0, 0
    for fn in sorted(os.listdir(d)):
        p = os.path.join(d, fn)
        if fn.startswith("cost-") and fn.endswith(".jsonl"):
            for line in open(p):
                try: r = json.loads(line)
                except Exception: continue
                t = r.get("type")
                if t == "gen_cost":
                    g = r.get("genId")
                    if g in seen_g: dupg += 1; continue
                    seen_g.add(g); costs[g] = float(r.get("cost") or 0)
                elif t in ("key_usage", "credits"):
                    keyusage.append(r)
        elif fn.endswith(".jsonl") and fn[0].isdigit():
            for line in open(p):
                try: r = json.loads(line)
                except Exception: continue
                if r.get("event") != "LLM_USAGE": continue
                k = r.get("k")
                if k:
                    if k in seen_k: dupk += 1; continue
                    seen_k.add(k)
                usage.append(r)
    return usage, costs, keyusage, dupk, dupg

def load_jobs(path):
    jobs, tests = {}, set()
    for row in csv.reader(open(path)):
        if len(row) < 6 or not row[0]: continue
        if row[4] == "1":
            tests.add(row[0]); continue
        jobs[row[0]] = {"day": row[1], "acc": row[2] or "unknown", "status": row[3], "delivered": row[5] == "1"}
    return jobs, tests

def window(usage, costs, jobs, tests, a, b):
    rows, nocost, excl_test = [], 0, 0
    for u in usage:
        day = th_day(u.get("ts", ""))
        if not day or not (a <= day <= b): continue
        jp = u.get("jobIdPrefix")
        if jp and jp in tests: excl_test += 1; continue
        cs = str(u.get("callSite") or "untagged")
        gid = u.get("genId") or u.get("generationId")
        c = costs.get(gid)
        if c is None: nocost += 1
        env = u.get("env") or ("staging" if "staging" in str(u.get("c", "")) else "pro")
        rows.append({"day": day, "env": env, "cs": cs, "model": u.get("model") or "?", "jp": jp,
                     "acc": (jobs.get(jp) or {}).get("acc") if jp else None,
                     "cost": c or 0.0, "has_cost": c is not None, "bucket": bucket(cs),
                     "ok": u.get("ok", True), "ctx": u.get("contextReason")})
    jw = {p: j for p, j in jobs.items() if a <= j["day"] <= b}
    days = len({r["day"] for r in rows}) or 1
    return {"from": a, "to": b, "days": days, "rows": rows, "jobs": jw,
            "calls_no_cost": nocost, "excluded_test_calls": excl_test}

def summarize(w, rate):
    rows = w["rows"]; jw = w["jobs"]
    pro = [r for r in rows if r["env"] == "pro"]
    out = {"from": w["from"], "to": w["to"], "days": w["days"],
           "calls_no_cost": w["calls_no_cost"], "excluded_test_calls": w["excluded_test_calls"]}
    by_env = defaultdict(lambda: [0, 0.0])
    for r in rows:
        by_env[r["env"]][0] += 1; by_env[r["env"]][1] += r["cost"]
    out["by_env"] = {k: {"calls": v[0], "usd": round(v[1], 4), "thb": round(v[1] * rate, 2)}
                     for k, v in sorted(by_env.items(), key=lambda x: -x[1][1])}
    pro_usd = sum(r["cost"] for r in pro)
    out["pro"] = {"calls": len(pro), "usd": round(pro_usd, 4), "thb": round(pro_usd * rate, 2),
                  "usd_per_day": round(pro_usd / w["days"], 4),
                  "thb_per_day": round(pro_usd / w["days"] * rate, 2),
                  "usd_per_month_proj": round(pro_usd / w["days"] * 30, 2),
                  "thb_per_month_proj": round(pro_usd / w["days"] * 30 * rate, 2)}
    by_b = defaultdict(lambda: [0, 0.0])
    for r in pro:
        by_b[r["bucket"]][0] += 1; by_b[r["bucket"]][1] += r["cost"]
    out["pro_by_bucket"] = {k: {"calls": v[0], "usd": round(v[1], 4), "thb": round(v[1] * rate, 2),
                                "pct": round(v[1] / pro_usd * 100, 1) if pro_usd else 0}
                            for k, v in sorted(by_b.items(), key=lambda x: -x[1][1])}
    by_cm = defaultdict(lambda: [0, 0.0])
    for r in pro:
        by_cm[(r["cs"], r["model"])][0] += 1; by_cm[(r["cs"], r["model"])][1] += r["cost"]
    out["pro_callsite_model"] = [{"callSite": k[0], "model": k[1], "bucket": bucket(k[0]),
                                  "calls": v[0], "usd": round(v[1], 4), "thb": round(v[1] * rate, 1),
                                  "pct": round(v[1] / pro_usd * 100, 1) if pro_usd else 0}
                                 for k, v in sorted(by_cm.items(), key=lambda x: -x[1][1])]
    # scan bucket แยก free/paid/unknown (unknown = pre-job / ไม่มี job context — ห้ามเดา)
    acc = defaultdict(lambda: [0, 0.0])
    for r in pro:
        if r["bucket"] != "scan": continue
        key = r["acc"] if r["acc"] else ("pre_job" if r["ctx"] == "pre_job" else "unknown_no_job")
        acc[key][0] += 1; acc[key][1] += r["cost"]
    out["pro_scan_by_access"] = {k: {"calls": v[0], "usd": round(v[1], 4), "thb": round(v[1] * rate, 1)}
                                 for k, v in sorted(acc.items(), key=lambda x: -x[1][1])}
    scan_usd = sum(r["cost"] for r in pro if r["bucket"] == "scan")
    created = len(jw); delivered = sum(1 for j in jw.values() if j["delivered"])
    failed = sum(1 for j in jw.values() if j["status"] == "failed")
    out["jobs"] = {"created": created, "delivered_with_evidence": delivered, "failed": failed,
                   "free_created": sum(1 for j in jw.values() if j["acc"] == "free"),
                   "paid_created": sum(1 for j in jw.values() if j["acc"] == "paid"),
                   "scan_usd": round(scan_usd, 4),
                   "usd_per_created": round(scan_usd / created, 5) if created else None,
                   "thb_per_created": round(scan_usd / created * rate, 3) if created else None,
                   "usd_per_delivered": round(scan_usd / delivered, 5) if delivered else None,
                   "thb_per_delivered": round(scan_usd / delivered * rate, 3) if delivered else None}
    out["daily_pro_usd"] = {d: round(sum(r["cost"] for r in pro if r["day"] == d), 4)
                            for d in sorted({r["day"] for r in pro})}
    return out

def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    rate = 36.0
    for i, a in enumerate(sys.argv):
        if a == "--rate": rate = float(sys.argv[i + 1])
    d, jobs_path, a1, b1, a2, b2 = args[:6]
    usage, costs, keyusage, dupk, dupg = load_events(d)
    jobs, tests = load_jobs(jobs_path)
    res = {"rate_thb_per_usd": rate, "source": "owner_config",
           "dedupe": {"dup_event_keys": dupk, "dup_genids": dupg},
           "latest": summarize(window(usage, costs, jobs, tests, a1, b1), rate),
           "prior": summarize(window(usage, costs, jobs, tests, a2, b2), rate)}
    print(json.dumps(res, ensure_ascii=False, indent=1))

if __name__ == "__main__":
    main()
