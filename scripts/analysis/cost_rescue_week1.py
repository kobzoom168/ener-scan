#!/usr/bin/env python3
"""Cost Rescue Week 1 — read-only analysis (Codex spec 9 ก.ย. 2026)

รวม LLM_USAGE (host collector jsonl) + gen_cost (cost puller jsonl) + jobs.csv (aggregate export)
→ ตารางระดับ job + summaries + counterfactual replay (objectCheck / verifier)

คุณสมบัติตามสเปก: read-only · ไม่แตะ DB/AI/LINE/Telegram · ไม่มี network ·
dedupe ด้วย event key/genId · ตัด staging/Ener-AI/smoke/test · output aggregate เท่านั้น
(ไม่มี UID/prompt/ข้อความลูกค้า) · rerun ได้ผลเดิม · --help / --selftest

Usage:
  python3 scripts/analysis/cost_rescue_week1.py \
      --usage-dir <dir มี YYYY-MM-DD.jsonl + cost-YYYY-MM-DD.jsonl> \
      --jobs-csv <jobs.csv: prefix8,dateTH,accessSource,status,is_test,attempt> \
      --from 2026-09-04 --to 2026-09-08 [--json out.json]

jobs.csv สร้างจาก psql (aggregate, ไม่มี uid):
  SELECT left(id::text,8), to_char(created_at AT TIME ZONE 'Asia/Bangkok','YYYY-MM-DD'),
         access_source, status, (line_user_id=<TEST_UID>)::int, attempt_count FROM scan_jobs ...
"""
import argparse, csv, json, os, sys
from collections import defaultdict

SMOKE_CALLSITES = {"smoke.telemetryCheck"}
SCAN_CALLSITE_PREFIXES = (
    "objectCheck", "deepScan", "stableFeatureExtract", "objectEmbedding",
    "imageForensic", "objectSameIdentityVerifier", "smartRejection",
)

def is_scan_callsite(cs):
    return any(cs.startswith(p) for p in SCAN_CALLSITE_PREFIXES)

def load_jobs(path):
    jobs = {}
    with open(path) as f:
        for row in csv.reader(f):
            if len(row) < 6 or not row[0]:
                continue
            jobs[row[0]] = {"dateTH": row[1], "accessSource": row[2] or "unknown",
                            "status": row[3], "is_test": row[4] == "1",
                            "attempt": int(row[5] or 0)}
    return jobs

def load_events(usage_dir, d_from, d_to):
    """คืน (usage_events, verifier_results, dup_keys) — dedupe ด้วย key k"""
    seen, usage, vres, dups = set(), [], [], 0
    for fn in sorted(os.listdir(usage_dir)):
        if not fn.endswith(".jsonl") or fn.startswith("cost-"):
            continue
        day = fn[:-6]
        if not (d_from <= day <= d_to):
            continue
        for line in open(os.path.join(usage_dir, fn)):
            try:
                r = json.loads(line)
            except Exception:
                continue
            k = r.get("k")
            if k:
                if k in seen:
                    dups += 1
                    continue
                seen.add(k)
            ev = r.get("event", "")
            if ev == "LLM_USAGE":
                usage.append(r)
            elif ev in ("OBJECT_SAME_IDENTITY_VERIFIER_RESULT", "OBJECT_SAME_IDENTITY_VERIFIER_ACCEPTED"):
                vres.append(r)
    return usage, vres, dups

def load_costs(usage_dir, d_from, d_to):
    cost, seen, dup = {}, set(), 0
    stats = {"pull_stats": [], "deadletter": 0}
    for fn in sorted(os.listdir(usage_dir)):
        if not fn.startswith("cost-") or not fn.endswith(".jsonl"):
            continue
        for line in open(os.path.join(usage_dir, fn)):
            try:
                r = json.loads(line)
            except Exception:
                continue
            t = r.get("type")
            if t == "gen_cost":
                g = r.get("genId")
                if g in seen:
                    dup += 1
                    continue
                seen.add(g)
                cost[g] = float(r.get("cost") or 0)
            elif t == "pull_stats":
                stats["pull_stats"].append(r)
    return cost, dup, stats

def analyze(usage, vres, costs, jobs, d_from, d_to):
    out = {"window": [d_from, d_to], "coverage": {}, "jobs": {}, "summary": {},
           "objectCheck": {}, "verifier": {}, "counterfactual": {}}
    # ---- filter: pro เท่านั้น + ตัด smoke + ตัด test job + หน้าต่างวัน (จาก jobs date หรือ ts) ----
    rows = []
    excluded = defaultdict(int)
    for u in usage:
        env = u.get("env")
        c = u.get("c", "")
        if env == "staging" or "staging" in c:
            excluded["staging"] += 1
            continue
        if env not in (None, "pro"):
            excluded["other_env"] += 1
            continue
        cs = str(u.get("callSite") or "untagged")
        if cs in SMOKE_CALLSITES:
            excluded["smoke"] += 1
            continue
        jp = u.get("jobIdPrefix")
        j = jobs.get(jp) if jp else None
        if j and j["is_test"]:
            excluded["test_account"] += 1
            continue
        if j and not (d_from <= j["dateTH"] <= d_to):
            excluded["outside_window_job"] += 1
            continue
        gid = u.get("genId") or u.get("generationId")
        rows.append({"cs": cs, "jp": jp, "acc": (j or {}).get("accessSource") or (u.get("accessSource") or "non_scan"),
                     "ok": u.get("ok", True), "model": u.get("model"),
                     "cost": costs.get(gid, None), "gid": gid,
                     "scan": is_scan_callsite(cs), "ts": u.get("ts", "")})
    out["coverage"]["excluded"] = dict(excluded)
    out["coverage"]["usage_rows"] = len(rows)
    with_cost = [r for r in rows if r["cost"] is not None]
    out["coverage"]["cost_join_rate"] = round(len(with_cost) / len(rows), 4) if rows else 0
    out["coverage"]["missing_cost_rows"] = len(rows) - len(with_cost)
    out["coverage"]["scan_calls_missing_jobIdPrefix"] = sum(1 for r in rows if r["scan"] and not r["jp"])

    # ---- job-level table ----
    per_job = defaultdict(lambda: {"calls": 0, "failed": 0, "cost": 0.0, "by_cs": defaultdict(int),
                                    "cost_by_cs": defaultdict(float)})
    nonscan_cost = 0.0
    for r in rows:
        cval = r["cost"] or 0.0
        if r["jp"] and r["scan"]:
            pj = per_job[r["jp"]]
            pj["calls"] += 1
            pj["cost"] += cval
            pj["by_cs"][r["cs"]] += 1
            pj["cost_by_cs"][r["cs"]] += cval
            if not r["ok"]:
                pj["failed"] += 1
        else:
            nonscan_cost += cval
    out["summary"]["non_scan_cost_usd"] = round(nonscan_cost, 4)

    # denominators จาก jobs.csv (ตัด test + หน้าต่าง)
    jwin = {p: j for p, j in jobs.items() if not j["is_test"] and d_from <= j["dateTH"] <= d_to}
    created = len(jwin)
    delivered = sum(1 for j in jwin.values() if j["status"] == "delivered")
    dfree = sum(1 for j in jwin.values() if j["status"] == "delivered" and j["accessSource"] == "free")
    dpaid = sum(1 for j in jwin.values() if j["status"] == "delivered" and j["accessSource"] == "paid")
    failedj = sum(1 for j in jwin.values() if j["status"] == "failed")
    scan_cost = sum(pj["cost"] for p, pj in per_job.items() if p in jwin)
    out["jobs"] = {"created": created, "delivered": delivered, "delivered_free": dfree,
                   "delivered_paid": dpaid, "failed": failedj,
                   "scan_cost_usd": round(scan_cost, 4),
                   "cost_per_created": round(scan_cost / created, 5) if created else None,
                   "cost_per_delivered": round(scan_cost / delivered, 5) if delivered else None}
    # cost แยก free/paid (จาก job join จริง ไม่เดา)
    for lbl in ("free", "paid"):
        cj = [p for p, j in jwin.items() if j["accessSource"] == lbl]
        cc = sum(per_job[p]["cost"] for p in cj if p in per_job)
        dn = sum(1 for p in cj if jwin[p]["status"] == "delivered")
        out["jobs"][f"cost_{lbl}_usd"] = round(cc, 4)
        out["jobs"][f"cost_per_{lbl}_delivered"] = round(cc / dn, 5) if dn else None

    # summaries: accessSource × callSite / calls-per-job / retry
    acc_cs = defaultdict(lambda: [0, 0.0])
    for r in rows:
        if not r["scan"] or not r["jp"] or r["jp"] not in jwin:
            continue
        key = f'{jwin[r["jp"]]["accessSource"]}|{r["cs"]}'
        acc_cs[key][0] += 1
        acc_cs[key][1] += r["cost"] or 0
    out["summary"]["accessSource_x_callSite"] = {k: {"calls": v[0], "usd": round(v[1], 4)}
                                                 for k, v in sorted(acc_cs.items(), key=lambda x: -x[1][1])}
    cs_per_job = defaultdict(list)
    for p, pj in per_job.items():
        if p not in jwin:
            continue
        for cs, n in pj["by_cs"].items():
            cs_per_job[cs].append(n)
    out["summary"]["calls_per_job"] = {cs: {"jobs": len(v), "mean": round(sum(v) / len(v), 2), "max": max(v)}
                                        for cs, v in sorted(cs_per_job.items())}
    out["summary"]["failed_calls"] = sum(pj["failed"] for p, pj in per_job.items() if p in jwin)

    # ---- objectCheck audit ----
    oc = {"jobs_with_multi": 0, "seq_counts": defaultdict(int),
          "calls": defaultdict(int), "usd": defaultdict(float)}
    for p, pj in per_job.items():
        if p not in jwin:
            continue
        ocs = {cs: n for cs, n in pj["by_cs"].items() if cs.startswith("objectCheck")}
        tot = sum(ocs.values())
        for cs, n in ocs.items():
            oc["calls"][cs] += n
            oc["usd"][cs] += pj["cost_by_cs"][cs]
        if tot > 1:
            oc["jobs_with_multi"] += 1
            sig = "+".join(sorted(f"{cs.split('objectCheck.')[1]}x{n}" for cs, n in ocs.items()))
            oc["seq_counts"][sig] += 1
    out["objectCheck"] = {"calls": dict(oc["calls"]), "usd": {k: round(v, 4) for k, v in oc["usd"].items()},
                          "jobs_with_multi": oc["jobs_with_multi"],
                          "sequences": dict(sorted(oc["seq_counts"].items(), key=lambda x: -x[1]))}

    # counterfactual objectCheck
    low_shadow_usd = sum(v for k, v in oc["usd"].items() if ".low_shadow." in k)
    low_shadow_calls = sum(v for k, v in oc["calls"].items() if ".low_shadow." in k)
    crystal_usd = oc["usd"].get("objectCheck.crystal_family", 0.0)
    crystal_calls = oc["calls"].get("objectCheck.crystal_family", 0)
    permissive_usd = oc["usd"].get("objectCheck.permissive", 0.0)
    strict_usd = oc["usd"].get("objectCheck.strict", 0.0)
    out["counterfactual"]["objectCheck"] = {
        "s1_exact_duplicate_low_shadow": {"calls_avoided": low_shadow_calls,
                                          "usd_saved_window": round(low_shadow_usd, 4)},
        "s2_overlap_crystal_into_strict": {"calls_avoided": crystal_calls,
                                           "usd_saved_window": round(crystal_usd, 4)},
        "s3_aggressive_merge_strict_permissive": {"usd_ceiling_window": round(permissive_usd, 4),
                                                  "note": "measurement only"},
        "strict_usd_window": round(strict_usd, 4),
    }

    # ---- verifier ----
    runs = defaultdict(lambda: {"ranks": [], "accepted_rank": None, "pool": 0, "cands": []})
    for v in vres:
        jp = v.get("jobIdPrefix")
        if not jp or (jp in jobs and jobs[jp]["is_test"]):
            continue
        if jp in jobs and not (d_from <= jobs[jp]["dateTH"] <= d_to):
            continue
        rr = runs[jp]
        try:
            rk = int(v.get("candidateRank") or 0)
        except Exception:
            rk = 0
        rr["ranks"].append(rk)
        rr["pool"] = max(rr["pool"], int(v.get("poolSize") or 0))
        rr["cands"].append(str(v.get("candidateIdPrefix") or ""))
        if str(v.get("same")) == "True" or v.get("same") is True:
            if rr["accepted_rank"] is None or rk < rr["accepted_rank"]:
                rr["accepted_rank"] = rk
    # ฐาน counterfactual = LLM_USAGE จริงเท่านั้น (RESULT รวมผล LightGlue ของ 2G ที่ไม่เสีย LLM)
    ver_rows = []
    for u in usage:
        if str(u.get("callSite")) != "objectSameIdentityVerifier":
            continue
        jp = u.get("jobIdPrefix")
        if not jp or jp not in jwin:
            continue
        gid = u.get("genId") or u.get("generationId")
        ver_rows.append({"jp": jp, "rank": int(u.get("candidateRank") or 0),
                         "path": str(u.get("decisionPath") or "unknown"),
                         "cost": costs.get(gid, 0) or 0})
    ver_usd = sum(v["cost"] for v in ver_rows)
    llm_groups = defaultdict(list)
    for v in ver_rows:
        llm_groups[(v["jp"], v["path"])].append(v)
    # accepted-by-LLM: RESULT same=true ที่ rank ตรงกับ LLM call ของ job นั้น
    llm_ranks_by_jp = defaultdict(set)
    for v in ver_rows:
        llm_ranks_by_jp[v["jp"]].add(v["rank"])
    dist = defaultdict(int)
    accepted_runs, rejected_all = 0, 0
    saved_top1 = saved_top2 = 0
    acc_at_gt1 = acc_at_gt2 = 0
    pair_seen, pair_repeat = set(), 0
    llm_accept_rank = {}
    for jp, rr in runs.items():
        if rr["accepted_rank"] and rr["accepted_rank"] in llm_ranks_by_jp.get(jp, set()):
            llm_accept_rank[jp] = rr["accepted_rank"]
        for cp in rr["cands"]:
            if cp in pair_seen:
                pair_repeat += 1
            pair_seen.add(cp)
    for (jp, path), calls in llm_groups.items():
        n = len(calls)
        dist[n] += 1
        ar = llm_accept_rank.get(jp)
        if ar:
            accepted_runs += 1
            if ar > 1:
                acc_at_gt1 += 1
            if ar > 2:
                acc_at_gt2 += 1
        else:
            rejected_all += 1
        saved_top1 += max(0, n - 1)
        saved_top2 += max(0, n - 2)
    ver_calls = ver_rows
    cost_per_call = (ver_usd / len(ver_calls)) if ver_calls else 0
    out["verifier"] = {"llm_runs": len(llm_groups), "result_event_runs": len(runs), "calls": len(ver_calls), "usd_window": round(ver_usd, 4),
                       "cost_per_call": round(cost_per_call, 5),
                       "candidateCount_distribution": dict(sorted(dist.items())),
                       "accepted_runs": accepted_runs, "rejected_all_runs": rejected_all,
                       "accepted_at_rank_gt1": acc_at_gt1, "accepted_at_rank_gt2": acc_at_gt2}
    out["counterfactual"]["verifier"] = {
        "top1_only": {"calls_avoided": saved_top1, "usd_saved_window": round(saved_top1 * cost_per_call, 4),
                      "risk_accepted_beyond_top1": acc_at_gt1},
        "top2_only": {"calls_avoided": saved_top2, "usd_saved_window": round(saved_top2 * cost_per_call, 4),
                      "risk_accepted_beyond_top2": acc_at_gt2},
        "pair_cache_upper_bound": {"repeat_candidate_verifications": pair_repeat,
                                   "usd_saved_window_upper": round(pair_repeat * cost_per_call, 4),
                                   "caveat": "ไม่มี uploader id ใน event — เป็น upper bound"},
    }
    return out

def selftest():
    import tempfile
    d = tempfile.mkdtemp()
    day = "2026-09-05"
    usage = [
        # job A (free): strict + low_shadow (dup) + verifier 3 candidates
        {"k": "u1", "event": "LLM_USAGE", "env": "pro", "c": "ener-scan-pro-worker-scan",
         "callSite": "objectCheck.strict", "jobIdPrefix": "jobaaaa1", "genId": "g1", "ok": True},
        {"k": "u2", "event": "LLM_USAGE", "env": "pro", "c": "ener-scan-pro-worker-scan",
         "callSite": "objectCheck.low_shadow.strict", "jobIdPrefix": "jobaaaa1", "genId": "g2", "ok": True},
        {"k": "u2dup", "event": "LLM_USAGE", "env": "pro", "c": "x", "callSite": "objectCheck.strict",
         "jobIdPrefix": "jobaaaa1", "genId": "g2", "ok": True},  # genId ซ้ำ → cost นับครั้งเดียวใน join
        {"k": "u3", "event": "LLM_USAGE", "env": "staging", "callSite": "objectCheck.strict",
         "jobIdPrefix": "jobstg01", "genId": "g3"},                # staging → ตัด
        {"k": "u4", "event": "LLM_USAGE", "env": "pro", "callSite": "smoke.telemetryCheck", "genId": "g4"},
        {"k": "u5", "event": "LLM_USAGE", "env": "pro", "callSite": "objectCheck.strict",
         "jobIdPrefix": "jobtest1", "genId": "g5"},                # test account → ตัด
        {"k": "u6", "event": "LLM_USAGE", "env": "pro", "callSite": "fbCaption", "genId": "g6"},  # non-scan
    ] + [
        {"k": f"v{i}", "event": "LLM_USAGE", "env": "pro", "callSite": "objectSameIdentityVerifier",
         "jobIdPrefix": "jobaaaa1", "genId": f"gv{i}", "ok": True,
         "candidateRank": i + 1, "candidateCount": 3, "decisionPath": "2d_embedding"} for i in range(3)
    ]
    vres = [
        {"k": f"r{i}", "event": "OBJECT_SAME_IDENTITY_VERIFIER_RESULT", "jobIdPrefix": "jobaaaa1",
         "candidateRank": i + 1, "poolSize": 3, "candidateIdPrefix": f"cand000{i}",
         "same": (i == 2)} for i in range(3)  # accepted ที่ rank 3
    ]
    with open(os.path.join(d, f"{day}.jsonl"), "w") as f:
        for r in usage + vres:
            f.write(json.dumps(r) + "\n")
    with open(os.path.join(d, f"cost-{day}.jsonl"), "w") as f:
        for g, c in [("g1", 0.002), ("g2", 0.001), ("g6", 0.0005), ("gv0", 0.001), ("gv1", 0.001), ("gv2", 0.001)]:
            f.write(json.dumps({"type": "gen_cost", "genId": g, "cost": c}) + "\n")
        f.write(json.dumps({"type": "gen_cost", "genId": "g1", "cost": 9.9}) + "\n")  # dup genId → ไม่นับซ้ำ
    jobs_csv = os.path.join(d, "jobs.csv")
    with open(jobs_csv, "w") as f:
        f.write("jobaaaa1,2026-09-05,free,delivered,0,0\n")
        f.write("jobtest1,2026-09-05,paid,delivered,1,0\n")
        f.write("jobbbbb2,2026-09-05,paid,failed,0,1\n")
    jobs = load_jobs(jobs_csv)
    usage_ev, vres_ev, dups = load_events(d, day, day)
    costs, cdup, _ = load_costs(d, day, day)
    out = analyze(usage_ev, vres_ev, costs, jobs, day, day)
    assert cdup == 1, "dup genId ใน cost ต้องถูกนับเป็น duplicate"
    assert out["coverage"]["excluded"]["staging"] == 1
    assert out["coverage"]["excluded"]["smoke"] == 1
    assert out["coverage"]["excluded"]["test_account"] == 1
    assert out["jobs"]["created"] == 2 and out["jobs"]["delivered"] == 1
    assert out["summary"]["non_scan_cost_usd"] == 0.0005, "non-scan แยก denominator"
    assert out["objectCheck"]["jobs_with_multi"] == 1
    cf = out["counterfactual"]
    assert cf["objectCheck"]["s1_exact_duplicate_low_shadow"]["calls_avoided"] == 1
    assert cf["verifier"]["top1_only"]["calls_avoided"] == 2
    assert cf["verifier"]["top1_only"]["risk_accepted_beyond_top1"] == 1, "accepted ที่ rank 3 ต้องเป็น risk"
    # ห้ามมี UID/secret ใน output
    s = json.dumps(out, ensure_ascii=False)
    assert "Ufe02fff" not in s and "sk-or-v1" not in s
    # rerun เดิม = ผลเดิม
    out2 = analyze(*load_events(d, day, day)[:2], load_costs(d, day, day)[0], jobs, day, day)
    assert json.dumps(out, sort_keys=True) == json.dumps(out2, sort_keys=True)
    print("SELFTEST_OK dedupe/exclusion/denominator/counterfactual/no-pii/reproducible")

def main():
    ap = argparse.ArgumentParser(description="Cost Rescue Week 1 read-only analysis")
    ap.add_argument("--usage-dir")
    ap.add_argument("--jobs-csv")
    ap.add_argument("--from", dest="d_from")
    ap.add_argument("--to", dest="d_to")
    ap.add_argument("--json", help="เขียนผลเต็มเป็น JSON")
    ap.add_argument("--selftest", action="store_true")
    a = ap.parse_args()
    if a.selftest:
        selftest()
        return
    if not (a.usage_dir and a.jobs_csv and a.d_from and a.d_to):
        ap.error("ต้องมี --usage-dir --jobs-csv --from --to (หรือ --selftest)")
    jobs = load_jobs(a.jobs_csv)
    usage, vres, dups = load_events(a.usage_dir, a.d_from, a.d_to)
    costs, cdup, stats = load_costs(a.usage_dir, a.d_from, a.d_to)
    out = analyze(usage, vres, costs, jobs, a.d_from, a.d_to)
    out["coverage"]["collector_dup_keys"] = dups
    out["coverage"]["cost_dup_genIds"] = cdup
    if a.json:
        with open(a.json, "w") as f:
            json.dump(out, f, ensure_ascii=False, indent=1)
    print(json.dumps(out, ensure_ascii=False, indent=1))

if __name__ == "__main__":
    main()
