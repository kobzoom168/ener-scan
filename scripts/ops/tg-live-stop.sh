#!/usr/bin/env bash
# หยุดระบบทดสอบแยก: ปิดรับ callback → รอ in-flight → เขียน/ตรวจหลักฐาน → ถ้าครบ parent ลบ container/worktree เอง · ถ้าไม่ครบ เก็บไว้ (KEEP) และรายงาน
# ใช้: scripts/ops/tg-live-stop.sh [OUT=/root/ener-tg-live/out]
set -uo pipefail
OUT="${1:-/root/ener-tg-live/out}"
[[ -f "$OUT/launcher.pid" ]] || { echo "ไม่พบ $OUT/launcher.pid"; exit 2; }
PID="$(cat "$OUT/launcher.pid")"
touch "$OUT/STOP"
for i in $(seq 1 60); do kill -0 "$PID" 2>/dev/null || break; sleep 1; done
kill -0 "$PID" 2>/dev/null && { echo "ยังไม่จบหลัง 60 วิ — ไม่ฆ่า (จะเสียหลักฐาน) ดู $OUT/run.log"; exit 3; }
grep -E "TG_LIVE_STOPPED|TG_LIVE_RESOURCES_KEPT" "$OUT/run.log" | tail -3 | cut -c1-300
EV="$(ls -t "$OUT"/evidence*.json 2>/dev/null | head -1)"
if [[ -f "$OUT/KEEP" ]]; then echo "RESULT: PARTIAL — ทรัพยากรถูกเก็บไว้ (เหตุ: $(tr '\n' ' ' < "$OUT/KEEP")) · evidence=$EV"; exit 3; fi
echo "RESULT: STOPPED · evidence=$EV"
echo "cleanup check: containers=$(docker ps -a --format '{{.Names}}' | grep -c ener-tg-it) port3390=$(ss -ltn | grep -c ':3390')"
