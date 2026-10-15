#!/bin/bash
# กู้ข้อความแจ้งเติมสิทธิ์ที่ค้าง (payment_entitlement_grants.notified_at IS NULL) จนเป็น 0 จริง — ใช้ก่อน/หลัง rollback โค้ด
# ใช้: bash grant-notify-recover.sh pro|staging <image-id-ตรึง> <abs-path-to-grant-notify-oneshot.mjs> [max-wait-sec=900]
#  - deadline เดียวครอบทุกอย่าง (Codex 15 ต.ค.): psql / docker run / sleep ถูกครอบด้วย `timeout` = เวลาที่เหลือ → คำสั่งค้างไม่ทำให้สคริปต์เลยกำหนด
#  - one-shot รันเป็น container มีชื่อ (ไม่ใช่ --rm อย่างเดียว) → หมดเวลา = `docker rm -f` เฉพาะ container ของรอบนั้น ไม่ทิ้งไว้
#  - นับใน DB ด้วย psql (ON_ERROR_STOP): query ล้ม = exit 3 "ไม่ทราบ" **ไม่ถือเป็นศูนย์** · RPC list ล้ม (one-shot exit 2) = exit 2
#  - RPC หยิบเฉพาะแถวอายุ > 2 นาที ครั้งละ ≤200 → วนหลาย batch + รอแถวอายุน้อย จนครบ deadline
#  - deadline เริ่ม **ก่อน** ตรวจ image (Codex รอบ 4) · ทุก query รวม query อายุแถวใช้เวลาที่เหลือ · count=0 จบทันทีไม่ถาม query อื่น
#  - cleanup/report หลังหมดเวลามี **grace แยก** (RECOVER_GRACE default 20 วิ ต่อคำสั่ง: rm container, report query) นอก deadline แต่มีขอบเขต ·
#    ลบ container ไม่สำเร็จ = รายงาน "NOT removed" + ชื่อ (ต้องเก็บมือ) ไม่อ้างว่าเก็บแล้ว
#  - exit: 0 pending=0 · 2 RPC list ล้ม · 3 query ล้ม · 5 ยังค้างเมื่อหมดเวลา (รอบจบปกติ ไม่มีคำสั่งค้าง) · 6 หมดเวลาขณะคำสั่งค้าง (image inspect / psql / docker run / query อายุแถว) — 5/6 พิมพ์รายการ prefix 8 ตัว
#  ตัวแปรสำหรับเทสต์ระบบแยกเท่านั้น (ค่า default = ของจริง): RECOVER_PSQL (คำสั่งแทน `sudo -u postgres psql`), RECOVER_DOCKER (แทน `docker`), RECOVER_SLEEP_STEP (default 30), RECOVER_SKIP_IMAGE_CHECK=1
set -uo pipefail
ENVNAME="${1:?pro|staging}"; IMAGE="${2:?image id}"; ONESHOT="${3:?abs path oneshot.mjs}"; MAX_WAIT="${4:-900}"
case "$ENVNAME" in
  pro) DB=ener_scan_pro; DIR=/root/ener-scan-pro; NET=ener-scan-pro_ener-scan-pro-net;;
  staging) DB=ener_scan_staging; DIR=/root/ener-scan-staging; NET=ener-scan-staging_ener-scan-staging-net;;
  *) echo "usage"; exit 1;; esac
DIR="${RECOVER_DIR_OVERRIDE:-$DIR}"
PSQL="${RECOVER_PSQL:-sudo -u postgres psql}"; DOCKER="${RECOVER_DOCKER:-docker}"; STEP="${RECOVER_SLEEP_STEP:-30}"; GRACE="${RECOVER_GRACE:-20}"
[[ "$MAX_WAIT" =~ ^[0-9]+$ ]] && [ "$MAX_WAIT" -ge 1 ] || { echo "max-wait must be positive integer seconds"; exit 1; }
[ -r "$ONESHOT" ] || { echo "oneshot file not readable: $ONESHOT"; exit 1; }

# deadline เริ่มที่นี่ — ก่อนคำสั่งภายนอกคำสั่งแรก (image inspect)
START=$(date +%s); DEADLINE=$((START + MAX_WAIT)); RUN_ID="grant-oneshot-$$-$START"; CUR_CONTAINER=""; LEFTOVER=""
remaining() { local r=$((DEADLINE - $(date +%s))); [ "$r" -gt 0 ] && echo "$r" || echo 0; }
is_timeout() { [ "$1" -eq 124 ] || [ "$1" -eq 137 ]; }
report_pending() { # รายการค้าง (prefix 8 ตัว ไม่มีข้อมูลลูกค้า) — grace แยกจาก deadline (มีขอบเขต GRACE วิ)
  timeout -k 2 "$GRACE" $PSQL -d "$DB" -Atq -c "SELECT left(payment_id::text,8)||' granted '||granted_at||' outbound='||COALESCE((SELECT status FROM public.outbound_messages o WHERE o.related_payment_id=g.payment_id AND o.kind='approve_notify' ORDER BY id DESC LIMIT 1),'none') FROM public.payment_entitlement_grants g WHERE notified_at IS NULL ORDER BY granted_at LIMIT 20" 2>&1 || echo "(report query failed/timed out within ${GRACE}s grace)"
}
cleanup_container() { # grace แยก (GRACE วิ) · ล้ม = รายงานชื่อค้าง ไม่อ้างว่าเก็บแล้ว
  [ -n "$CUR_CONTAINER" ] || return 0
  if timeout -k 2 "$GRACE" $DOCKER rm -f "$CUR_CONTAINER" >/dev/null 2>&1; then echo "removed one-shot container $CUR_CONTAINER"
  else LEFTOVER="$LEFTOVER $CUR_CONTAINER"; echo "WARN: one-shot container NOT removed (within ${GRACE}s grace): $CUR_CONTAINER — เก็บมือ: $DOCKER rm -f $CUR_CONTAINER"; fi
  CUR_CONTAINER=""
}
give_up() { # $1=exit code $2=reason — cleanup/report อยู่นอก deadline แต่มีขอบเขต GRACE ต่อคำสั่ง
  echo "STOP: $2 (elapsed $(( $(date +%s) - START ))s / max ${MAX_WAIT}s; cleanup/report grace ${GRACE}s each)"; cleanup_container
  echo "pending report:"; report_pending
  [ -n "$LEFTOVER" ] && echo "LEFTOVER containers (not removed):$LEFTOVER"
  exit "$1"
}
trap 'give_up 6 "interrupted"' INT TERM

if [ "${RECOVER_SKIP_IMAGE_CHECK:-0}" != "1" ]; then
  rem=$(remaining); timeout -k 2 "$rem" $DOCKER image inspect "$IMAGE" >/dev/null 2>&1; rc=$?
  is_timeout "$rc" && give_up 6 "deadline reached while inspecting image"
  [ "$rc" -eq 0 ] || { echo "image not found: $IMAGE"; exit 1; }
fi
count_pending() { # พิมพ์ตัวเลข · return 3 เมื่อ query ล้ม · return 6 เมื่อหมดเวลา
  local rem out rc; rem=$(remaining); [ "$rem" -gt 0 ] || return 6
  out=$(timeout -k 2 "$rem" $PSQL -d "$DB" -Atq -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM public.payment_entitlement_grants WHERE notified_at IS NULL" 2>&1); rc=$?
  is_timeout "$rc" && { echo "DB_QUERY_TIMEOUT" >&2; return 6; }
  [ "$rc" -eq 0 ] || { echo "DB_QUERY_FAILED: $out" >&2; return 3; }
  [[ "$out" =~ ^[0-9]+$ ]] || { echo "DB_QUERY_UNEXPECTED: $out" >&2; return 3; }
  echo "$out"
}
young_pending() { # ข้อมูลประกอบ (ไม่ใช่ตัวตัดสิน) · ใช้เวลาที่เหลือ · ค้าง = return 6
  local rem out rc; rem=$(remaining); [ "$rem" -gt 0 ] || return 6
  out=$(timeout -k 1 "$rem" $PSQL -d "$DB" -Atq -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM public.payment_entitlement_grants WHERE notified_at IS NULL AND granted_at >= now() - interval '2 minutes'" 2>/dev/null); rc=$?
  is_timeout "$rc" && return 6
  [ "$rc" -eq 0 ] && echo "$out" || echo "?"
}

round=0
while :; do
  rem=$(remaining); [ "$rem" -gt 0 ] || break   # หมดเวลาแบบรอบจบปกติ → exit 5 (6 สงวนให้คำสั่งค้างระหว่างรัน)
  n=$(count_pending); rc=$?
  case $rc in 0) ;; 3) give_up 3 "cannot determine pending count (DB query failed) — not zero";; 6) give_up 6 "deadline reached while counting";; esac
  [ "$n" = "0" ] && { echo "[$(date -u +%H:%M:%SZ)] round=$round pending_notify=0"; echo "DONE: pending_notify=0"; exit 0; } # จบทันที ไม่ถาม query อื่น
  y=$(young_pending); yrc=$?; [ "$yrc" -eq 6 ] && give_up 6 "deadline reached while querying row ages"
  echo "[$(date -u +%H:%M:%SZ)] round=$round pending_notify=$n young(<2min)=$y remaining=$(remaining)s"
  rem=$(remaining); [ "$rem" -gt 0 ] || break
  round=$((round + 1)); CUR_CONTAINER="$RUN_ID-r$round"
  timeout -k 5 "$rem" $DOCKER run --name "$CUR_CONTAINER" --env-file "$DIR/.env" --network "$NET" -v "$ONESHOT:/app/ops-oneshot.mjs:ro" "$IMAGE" node /app/ops-oneshot.mjs; rc=$?
  is_timeout "$rc" && give_up 6 "deadline reached while one-shot container was running"
  cleanup_container
  case $rc in 0) ;; 2) give_up 2 "one-shot cannot list grants (RPC failed) — not zero";; 4) echo "WARN: some grants failed to enqueue — retrying after wait";; *) give_up "$rc" "one-shot exit $rc";; esac
  rem=$(remaining); [ "$rem" -gt 0 ] || break
  s=$STEP; [ "$s" -gt "$rem" ] && s=$rem
  sleep "$s"
done
echo "STILL PENDING after ${MAX_WAIT}s — รายงานค้าง (prefix 8 ตัว ไม่มีข้อมูลลูกค้า; report grace ${GRACE}s):"; report_pending
[ -n "$LEFTOVER" ] && echo "LEFTOVER containers (not removed):$LEFTOVER"; exit 5
