#!/usr/bin/env bash
# เกณฑ์ release (Codex 12 ส.ค. 2026): fail ใหม่นอกลิสต์ tests/known-failing.txt = regression
# ใช้: bash scripts/test-baseline-check.sh   (ตั้ง env placeholder ให้เองบนเครื่อง dev)
set -u
cd "$(dirname "$0")/.."
export OPENAI_API_KEY="${OPENAI_API_KEY:-sk-test}"
export LOCAL_POSTGREST_URL="${LOCAL_POSTGREST_URL:-http://127.0.0.1:9}"
export LOCAL_POSTGREST_ANON_KEY="${LOCAL_POSTGREST_ANON_KEY:-x}"
export LOCAL_POSTGREST_SERVICE_KEY="${LOCAL_POSTGREST_SERVICE_KEY:-x}"
export SUPABASE_URL="${SUPABASE_URL:-http://127.0.0.1:9}"
export SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-x}"
while IFS='=' read -r k _; do
  [ -n "$k" ] && [ -z "${!k:-}" ] && export "$k=test-placeholder"
done < <(grep -E '^[A-Z_]+=' .env.example | grep -v '^#')

OUT=$(npm test 2>&1)
# Parser ต้องเทียบ "leaf test name" เหมือนกันทุกเวอร์ชัน Node (Codex รอบ 4):
# Node บางรุ่น flatten leaf ขึ้น top-level บางรุ่น nest ใต้ไฟล์ (indent) —
# เก็บ not ok ทุก indent แล้วตัดบรรทัดที่เป็นชื่อไฟล์ (file-level summary) ทิ้ง
FAILS=$(echo "$OUT" | grep -E '^[[:space:]]*not ok'   | sed -E 's/^[[:space:]]*not ok [0-9]+ -? ?//; s/[[:space:]]*# (SKIP|TODO).*$//'   | grep -vE '^tests/[^[:space:]]+\.(m?js|ts)$' | sort -u)
KNOWN=$(grep -vE '^#|^$' tests/known-failing.txt | sort -u)

NEW=$(comm -13 <(echo "$KNOWN") <(echo "$FAILS"))
FIXED=$(comm -23 <(echo "$KNOWN") <(echo "$FAILS"))
echo "$OUT" | grep -E '^# (pass|fail)'
if [ -n "$FIXED" ]; then
  echo "--- เขียวแล้ว เอาออกจาก known-failing.txt ได้: ---"; echo "$FIXED"
fi
if [ -n "$NEW" ]; then
  echo "❌ REGRESSION — fail ใหม่นอก baseline:"; echo "$NEW"; exit 1
fi
echo "✅ ไม่มี fail ใหม่นอก baseline"
