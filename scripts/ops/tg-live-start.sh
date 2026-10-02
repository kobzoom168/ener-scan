#!/usr/bin/env bash
# เริ่ม "Telegram จริง → ระบบทดสอบแยก" (วิธี A) จาก worktree ของ exact SHA — ต้องเรียกสคริปต์นี้จาก worktree ที่ HEAD = SHA นั้น
# ใช้: scripts/ops/tg-live-start.sh <SHA> <ENV_FILE(600)> [OUT=/root/ener-tg-live/out] [PORT=3390] [--dry-run]
# ตรวจสด: node/docker · ดิสก์ · RAM · พอร์ต · images · node_modules — ไม่ยึดตัวเลขจากรายงานเก่า · ไม่พิมพ์ค่า secret
set -euo pipefail
SHA="${1:?SHA}"; ENVF="${2:?ENV_FILE}"; OUT="${3:-/root/ener-tg-live/out}"; PORT="${4:-3390}"; DRY="${5:-}"
HERE="$(cd "$(dirname "$0")/../.." && pwd)"
HEAD="$(git -C "$HERE" rev-parse HEAD)"
[[ "$HEAD" == "$SHA"* ]] || { echo "worktree นี้ HEAD=$HEAD ไม่ตรง SHA=$SHA — สร้าง worktree ของ SHA ก่อน: git worktree add --detach <dir> $SHA"; exit 2; }
command -v node >/dev/null || { echo "ไม่มี node"; exit 2; }; command -v docker >/dev/null || { echo "ไม่มี docker"; exit 2; }
[[ "$(stat -c %a "$ENVF")" == "600" ]] || { echo "ไฟล์ secret ต้อง 600: $ENVF"; exit 2; }
for v in TELEGRAM_APPROVAL_BOT_TOKEN TELEGRAM_APPROVAL_CHAT_ID TELEGRAM_APPROVER_USER_IDS TELEGRAM_WEBHOOK_SECRET TELEGRAM_SLIP_APPROVAL_ENABLED; do grep -qE "^$v=." "$ENVF" || { echo "ขาด $v ในไฟล์ secret"; exit 2; }; done
grep -qE '^TELEGRAM_WEBHOOK_SECRET=[A-Za-z0-9_-]{32,256}$' "$ENVF" || { echo "TELEGRAM_WEBHOOK_SECRET รูปแบบไม่ถูก (ต้อง [A-Za-z0-9_-]{32,256} เช่น openssl rand -hex 32)"; exit 2; }
mkdir -p "$OUT"
# ตรวจทรัพยากรสด
FREE_TMP=$(df -BG --output=avail /tmp | tail -1 | tr -dc 0-9); FREE_DOCKER=$(df -BG --output=avail "$(docker info -f '{{.DockerRootDir}}' 2>/dev/null || echo /var/lib/docker)" | tail -1 | tr -dc 0-9)
FREE_RAM=$(free -m | awk 'NR==2{print $7}')
echo "preflight: disk /tmp=${FREE_TMP}G docker=${FREE_DOCKER}G ram_avail=${FREE_RAM}MB port=$PORT"
(( FREE_TMP >= 3 && FREE_DOCKER >= 3 )) || { echo "ดิสก์ว่างไม่ถึง 3G"; exit 2; }
(( FREE_RAM >= 1024 )) || { echo "RAM ว่างไม่ถึง 1G"; exit 2; }
if ss -ltn 2>/dev/null | grep -qE "[:.]$PORT\b"; then echo "พอร์ต $PORT ถูกใช้อยู่"; exit 2; fi
[[ -f "$OUT/READY.json" || -f "$OUT/KEEP" || -f "$OUT/STOP" ]] && { echo "OUT=$OUT มีไฟล์จากรอบก่อน (READY/KEEP/STOP) — ย้าย/ลบก่อน"; exit 2; }
# node_modules + images
[[ -f "$HERE/node_modules/express/package.json" ]] || { echo "npm ci --omit=dev ใน $HERE (ต้องถึง npm registry)"; (cd "$HERE" && npm ci --omit=dev --no-audit --no-fund); }
for img in pgvector/pgvector:pg16 postgrest/postgrest:v12.2.3; do docker image inspect "$img" >/dev/null 2>&1 || { echo "pull $img"; docker pull -q "$img" >/dev/null; }; done
ARGS=(--live); [[ "$DRY" == "--dry-run" ]] && ARGS+=(--dry-run)
cd "$HERE"
ENER_TG_LIVE_SHA="$SHA" ENER_TG_LIVE_ENV_FILE="$ENVF" ENER_TG_LIVE_OUT="$OUT" ENER_TG_LIVE_PORT="$PORT" ENER_TG_LIVE_BLOCK_TELEGRAM="${ENER_TG_LIVE_BLOCK_TELEGRAM:-}" \
  nohup node scripts/ops/test-telegram-approval-integration.mjs "${ARGS[@]}" > "$OUT/run.log" 2>&1 &
echo $! > "$OUT/launcher.pid"
echo "started pid=$(cat "$OUT/launcher.pid") sha=$HEAD out=$OUT ${ARGS[*]}"
# รอ READY / FAILED (สูงสุด 10 นาที — รวม pull/npm ci)
for i in $(seq 1 300); do
  [[ -f "$OUT/READY.json" ]] && { echo "READY:"; sed -E 's/"uid":"[^"]*"/"uid":"<synthetic>"/g' "$OUT/READY.json" | head -40; exit 0; }
  [[ -f "$OUT/FAILED.json" ]] && { echo "FAILED (ทรัพยากรถูกเก็บไว้):"; cat "$OUT/FAILED.json" | head -40; exit 3; }
  if ! kill -0 "$(cat "$OUT/launcher.pid")" 2>/dev/null; then echo "โปรเซสจบก่อน READY — ดู $OUT/run.log"; tail -20 "$OUT/run.log"; exit 3; fi
  sleep 2
done
echo "หมดเวลารอ READY — ดู $OUT/run.log"; exit 3
