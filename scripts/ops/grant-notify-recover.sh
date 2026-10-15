#!/bin/bash
# กู้ข้อความแจ้งเติมสิทธิ์ที่ค้าง (payment_entitlement_grants.notified_at IS NULL) จนเป็น 0 จริง — ใช้ก่อน/หลัง rollback โค้ด
# ใช้: bash grant-notify-recover.sh pro|staging <image-id-ตรึง> <abs-path-to-grant-notify-oneshot.mjs> [max-wait-sec=900]
#  - นับใน DB ด้วย psql (ON_ERROR_STOP): query ล้ม = exit 3 "ไม่ทราบ" **ไม่ถือเป็นศูนย์**
#  - RPC หยิบเฉพาะแถวอายุ > 2 นาที ครั้งละ ≤200 → วนหลาย batch + รอแถวอายุน้อย จนครบ max-wait
#  - จบ: exit 0 เมื่อ pending=0 · exit 5 ยังค้าง (พิมพ์รายการ prefix 8 ตัว) · exit 2/4 ตาม one-shot
set -uo pipefail
ENVNAME="${1:?pro|staging}"; IMAGE="${2:?image id}"; ONESHOT="${3:?abs path oneshot.mjs}"; MAX_WAIT="${4:-900}"
case "$ENVNAME" in
  pro) DB=ener_scan_pro; DIR=/root/ener-scan-pro; NET=ener-scan-pro_ener-scan-pro-net;;
  staging) DB=ener_scan_staging; DIR=/root/ener-scan-staging; NET=ener-scan-staging_ener-scan-staging-net;;
  *) echo "usage"; exit 1;; esac
[ -r "$ONESHOT" ] || { echo "oneshot file not readable: $ONESHOT"; exit 1; }
docker image inspect "$IMAGE" >/dev/null 2>&1 || { echo "image not found: $IMAGE"; exit 1; }

count_pending() { # พิมพ์ตัวเลข หรือ return ≠0 เมื่อ query ล้ม
  local out; out=$(sudo -u postgres psql -d "$DB" -Atq -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM public.payment_entitlement_grants WHERE notified_at IS NULL" 2>&1) || { echo "DB_QUERY_FAILED: $out" >&2; return 3; }
  [[ "$out" =~ ^[0-9]+$ ]] || { echo "DB_QUERY_UNEXPECTED: $out" >&2; return 3; }
  echo "$out"
}
young_pending() { sudo -u postgres psql -d "$DB" -Atq -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM public.payment_entitlement_grants WHERE notified_at IS NULL AND granted_at >= now() - interval '2 minutes'" 2>/dev/null || echo "?"; }

start=$(date +%s)
while :; do
  n=$(count_pending) || { echo "STOP: cannot determine pending count (not zero)"; exit 3; }
  echo "[$(date -u +%H:%M:%SZ)] pending_notify=$n young(<2min)=$(young_pending)"
  [ "$n" = "0" ] && { echo "DONE: pending_notify=0"; exit 0; }
  elapsed=$(( $(date +%s) - start ))
  [ "$elapsed" -ge "$MAX_WAIT" ] && break
  docker run --rm --env-file "$DIR/.env" --network "$NET" -v "$ONESHOT:/app/ops-oneshot.mjs:ro" "$IMAGE" node /app/ops-oneshot.mjs; rc=$?
  case $rc in 0) ;; 2) echo "STOP: one-shot cannot list grants (RPC failed) — not zero"; exit 2;; 4) echo "WARN: some grants failed to enqueue — retrying after wait";; *) echo "STOP: one-shot exit $rc"; exit $rc;; esac
  sleep 30
done
echo "STILL PENDING after ${MAX_WAIT}s — รายงานค้าง (prefix 8 ตัว ไม่มีข้อมูลลูกค้า):"
sudo -u postgres psql -d "$DB" -Atq -c "SELECT left(payment_id::text,8)||' granted '||granted_at||' outbound='||COALESCE((SELECT status FROM public.outbound_messages o WHERE o.related_payment_id=g.payment_id AND o.kind='approve_notify' ORDER BY id DESC LIMIT 1),'none') FROM public.payment_entitlement_grants g WHERE notified_at IS NULL ORDER BY granted_at LIMIT 20"
exit 5
