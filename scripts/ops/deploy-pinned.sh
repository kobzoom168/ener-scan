#!/bin/bash
# Blue-Green deploy แบบ "ตรึง SHA" — ไม่มี git pull · checkout --detach <SHA> แล้วตรวจ HEAD ก่อน build และก่อนสลับทุกครั้ง
# ใช้: bash deploy-pinned.sh pro|staging <full-40-hex-sha> [--frozen-ref origin/<branch>] [--keep svc[,svc]] [--allow-dirty path[,path]]
#   --frozen-ref  ตรวจว่า ref ที่ fetch มายังชี้ SHA เดิม (ไม่ตรง = หยุด: branch ถูกขยับ) · default ไม่ตรวจ ref แค่ fetch SHA
#   --keep        บริการที่ "ไม่" recreate ในรอบนี้ (เช่น worker-maintenance ตอน rollback ที่ต้องคง sweep ใหม่ไว้ก่อน)
#   --allow-dirty ไฟล์ที่ยอมให้แก้บนเครื่องได้ (default docker-compose.yml) · ไฟล์อื่นแก้/untracked ที่ชื่อชนไฟล์ใน repo = หยุด
# คัดลอกลำดับจาก /root/deploy-ener.sh (blue-green) เปลี่ยนเฉพาะขั้น git และเพิ่ม gate — ไม่แก้ไฟล์ /root/deploy-ener.sh
set -euo pipefail

ENVNAME="${1:?pro|staging}"; SHA="${2:?full sha}"; shift 2
FROZEN_REF=""; KEEP=""; ALLOW_DIRTY="docker-compose.yml"
while [ $# -gt 0 ]; do case "$1" in
  --frozen-ref) FROZEN_REF="$2"; shift 2;; --keep) KEEP="$2"; shift 2;; --allow-dirty) ALLOW_DIRTY="$2"; shift 2;;
  *) echo "unknown arg $1"; exit 1;; esac; done
[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || { echo "SHA must be full 40-hex"; exit 1; }

if [ "$ENVNAME" = "pro" ]; then
  DIR=/root/ener-scan-pro; GREEN=ener-scan-pro-green; IMG=ener-scan-pro-ener-scan; NET=ener-scan-pro_ener-scan-pro-net; BLUE_PORT=3100; GREEN_PORT=3101
elif [ "$ENVNAME" = "staging" ]; then
  DIR=/root/ener-scan-staging; GREEN=ener-scan-staging-green; IMG=ener-scan-staging-ener-scan; NET=ener-scan-staging_ener-scan-staging-net; BLUE_PORT=3200; GREEN_PORT=3201
else echo "usage: $0 pro|staging <sha>"; exit 1; fi
DIR="${ENER_DEPLOY_DIR_OVERRIDE:-$DIR}" # สำหรับทดสอบสคริปต์บน clone ชั่วคราวเท่านั้น

wait_healthy() { for i in $(seq 1 45); do if curl -sf -o /dev/null "http://127.0.0.1:$1/"; then echo "[$2] healthy"; return 0; fi; sleep 2; done; echo "[$2] NOT healthy after 90s"; return 1; }
assert_head() { # $1=label
  local h; h=$(git rev-parse HEAD)
  [ "$h" = "$SHA" ] || { echo "STOP [$1]: HEAD=$h != pinned $SHA"; exit 10; }
  local dirty; dirty=$(git status --porcelain --untracked-files=no | awk '{print $2}')
  for f in $dirty; do case ",$ALLOW_DIRTY," in *",$f,"*) ;; *) echo "STOP [$1]: tracked file modified on server: $f"; exit 11;; esac; done
  echo "[$1] HEAD=$SHA ok · dirty(allowed)=${dirty:-none}"
}

cd "$DIR"
echo "== [$ENVNAME] pin $SHA (no pull) =="
if [ -n "$FROZEN_REF" ]; then
  # fetch ref แช่แข็งแบบระบุชื่อ (อัปเดต remote-tracking ref แน่ ๆ) แล้วเทียบกับ SHA ก่อนทำอะไรต่อ
  br="${FROZEN_REF#origin/}"
  git fetch --quiet --force origin "refs/heads/$br:refs/remotes/origin/$br" || { echo "STOP: cannot fetch $FROZEN_REF"; exit 12; }
  r=$(git rev-parse "$FROZEN_REF"); [ "$r" = "$SHA" ] || { echo "STOP: $FROZEN_REF=$r moved away from pinned $SHA (branch was changed) — not deploying"; exit 13; }
else
  git fetch --quiet origin "$SHA" 2>/dev/null || git fetch --quiet origin
fi
git cat-file -e "$SHA^{commit}" || { echo "STOP: $SHA not present after fetch"; exit 12; }
git checkout --quiet --detach "$SHA"
assert_head "after-checkout"

if [ "${DRY_RUN:-0}" = "1" ]; then echo "DRY_RUN: would build+deploy $SHA (keep=${KEEP:-none})"; exit 0; fi

echo "== building new image =="
assert_head "before-build"
docker compose build ener-scan
IMG_ID=$(docker image inspect "$IMG" --format '{{.Id}}'); echo "built $IMG -> $IMG_ID"

echo "== starting GREEN on :$GREEN_PORT =="
docker rm -f "$GREEN" >/dev/null 2>&1 || true
docker run -d --name "$GREEN" --env-file .env --network "$NET" -p "127.0.0.1:$GREEN_PORT:3000" "$IMG" >/dev/null
wait_healthy "$GREEN_PORT" GREEN

echo "== recreating BLUE + workers (traffic rides on GREEN) =="
assert_head "before-switch"
if [ -n "$KEEP" ]; then
  ALL=$(docker compose config --services | grep -E '^(ener-scan|worker-)' || true)
  SVCS=""; for s in $ALL; do case ",$KEEP," in *",$s,"*) echo "keep (not recreated): $s";; *) SVCS="$SVCS $s";; esac; done
  # shellcheck disable=SC2086
  docker compose up -d --build --no-deps $SVCS
else
  docker compose up -d --build
fi
wait_healthy "$BLUE_PORT" BLUE

echo "== removing GREEN =="
docker rm -f "$GREEN" >/dev/null
assert_head "after-deploy"
echo "== images =="; for c in $(docker compose ps -q); do docker inspect "$c" --format '{{.Name}} {{.Image}}'; done
echo "== DONE [$ENVNAME] pinned deploy $SHA complete (keep=${KEEP:-none}) =="
