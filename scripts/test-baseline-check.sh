#!/usr/bin/env bash
# เกณฑ์ release (Codex 12 ส.ค. + รอบ 19 ส.ค.): fail ใหม่นอก tests/known-failing.txt = regression
# ใช้: bash scripts/test-baseline-check.sh   (ตั้ง env placeholder ให้เองบนเครื่อง dev)
#
# รันทีละไฟล์ผ่าน scripts/run-baseline.mjs แล้วประกอบ identity เป็น file::leaf —
# ไม่พึ่งโครงสร้าง TAP ของ node (flatten/nest ต่างกันคนละเครื่องจนหลักฐานไม่ตรงกัน)
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

node scripts/run-baseline.mjs
