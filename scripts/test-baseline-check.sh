#!/usr/bin/env bash
# เกณฑ์ release (Codex 12 ส.ค. 2026 + รอบ 19 ส.ค.): fail ใหม่นอกลิสต์ tests/known-failing.txt = regression
# ใช้: bash scripts/test-baseline-check.sh   (ตั้ง env placeholder ให้เองบนเครื่อง dev)
#
# โครงสร้าง gate (Codex รอบ 5 — กัน false green):
# 1. เก็บ leaf "not ok" ทุก indent (TAP reporter บังคับใน npm test แล้ว โครงสร้างคงที่ทุก Node)
# 2. เก็บ file-level "not ok" (ชื่อเป็น tests/*.js) แยกต่างหาก
# 3. file ที่ fail แต่หา leaf failure ในบล็อกของมันไม่ได้เลย (เช่น import crash) = regression เสมอ
# 4. npm test exit != 0 จะปล่อยผ่านได้เฉพาะเมื่อ leaf failure ทุกตัว map เข้า known list ครบ
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
NPM_EXIT=$?

# leaf fails: not ok ทุก indent ที่ "ไม่ใช่" ชื่อไฟล์
FAILS=$(echo "$OUT" | grep -E '^[[:space:]]*not ok' \
  | sed -E 's/^[[:space:]]*not ok [0-9]+ -? ?//; s/[[:space:]]*# (SKIP|TODO).*$//' \
  | grep -vE '^tests/[^[:space:]]+\.(m?js|ts)$' | sort -u)
# file-level fails
FILE_FAILS=$(echo "$OUT" | grep -E '^[[:space:]]*not ok' \
  | sed -E 's/^[[:space:]]*not ok [0-9]+ -? ?//' \
  | grep -E '^tests/[^[:space:]]+\.(m?js|ts)$' | sort -u)
KNOWN=$(grep -vE '^#|^$' tests/known-failing.txt | sort -u)

NEW=$(comm -13 <(echo "$KNOWN") <(echo "$FAILS"))
FIXED=$(comm -23 <(echo "$KNOWN") <(echo "$FAILS"))

# file fail ที่ไม่มี leaf failure อธิบาย (import crash ฯลฯ) = regression เสมอ
UNEXPLAINED_FILES=""
if [ -n "$FILE_FAILS" ]; then
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    # หา leaf not ok ภายในบล็อกของไฟล์นี้ (บรรทัดระหว่าง "# Subtest: <file>" กับ file-level not ok)
    BLOCK=$(echo "$OUT" | awk -v file="$f" '
      index($0, "# Subtest: " file) { on=1; next }
      on && $0 ~ "not ok [0-9]+ - " file "$" { on=0 }
      on { print }')
    LEAFS_IN_FILE=$(echo "$BLOCK" | grep -cE '^[[:space:]]+not ok' || true)
    if [ "${LEAFS_IN_FILE:-0}" -eq 0 ]; then
      UNEXPLAINED_FILES+="$f"$'\n'
    fi
  done <<< "$FILE_FAILS"
fi
UNEXPLAINED_FILES=$(echo "$UNEXPLAINED_FILES" | grep -v '^$' || true)

echo "$OUT" | grep -E '^# (pass|fail)' | tail -2
echo "npm test exit: $NPM_EXIT"
if [ -n "$FAILS" ]; then
  echo "--- leaf failures (identity จริง): ---"; echo "$FAILS"
fi
if [ -n "$FILE_FAILS" ]; then
  echo "--- failing test files: ---"; echo "$FILE_FAILS"
fi
if [ -n "$FIXED" ]; then
  echo "--- เขียวแล้ว เอาออกจาก known-failing.txt ได้: ---"; echo "$FIXED"
fi
if [ -n "$UNEXPLAINED_FILES" ]; then
  echo "❌ REGRESSION — ไฟล์ fail โดยไม่มี leaf failure อธิบาย (import crash?):"
  echo "$UNEXPLAINED_FILES"
  exit 1
fi
if [ -n "$NEW" ]; then
  echo "❌ REGRESSION — fail ใหม่นอก baseline:"; echo "$NEW"; exit 1
fi
if [ "$NPM_EXIT" -ne 0 ] && [ -z "$FAILS" ]; then
  echo "❌ npm test exit $NPM_EXIT แต่ parser หา failure ไม่เจอ — ห้ามปล่อยผ่าน (gate พังเอง)"
  exit 1
fi
echo "✅ ไม่มี fail ใหม่นอก baseline (leaf ที่ fail ทั้งหมดอยู่ใน known list)"
