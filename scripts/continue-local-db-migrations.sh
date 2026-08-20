#!/usr/bin/env bash
# Continue after partial apply (scan_jobs PK + 022+).
set -euo pipefail

SRC_ROOT="${1:-/root/ener-scan}"
WORK="/tmp/ener-scan-migrations-continue"
DB="${LOCAL_PG_DB:-ener_scan}"

rm -rf "$WORK"
mkdir -p "$WORK/sql/backup" "$WORK/supabase/migrations" "$WORK/docs/migrations"
cp -a "$SRC_ROOT/sql/000"*.sql "$WORK/sql/" 2>/dev/null || true
cp -a "$SRC_ROOT/sql/backup/022"*.sql "$WORK/sql/backup/" 2>/dev/null || true
cp -a "$SRC_ROOT/sql/backup/023"*.sql "$WORK/sql/backup/" 2>/dev/null || true
cp -a "$SRC_ROOT/sql/"[0-9]*.sql "$WORK/sql/" 2>/dev/null || true
cp -a "$SRC_ROOT/docs/migrations/"*.sql "$WORK/docs/migrations/" 2>/dev/null || true
cp -a "$SRC_ROOT/supabase/migrations/"*.sql "$WORK/supabase/migrations/" 2>/dev/null || true
chmod -R a+rX "$WORK"
find "$WORK" -name '*.sql' -exec sed -i 's/\r$//' {} +

run_sql() {
  echo "==> $(basename "$1")"
  sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB" -f "$1"
}

[[ -f "$WORK/sql/000c_local_postgrest_roles.sql" ]] && run_sql "$WORK/sql/000c_local_postgrest_roles.sql"

for f in "$WORK"/sql/backup/022*.sql "$WORK"/sql/backup/023*.sql; do
  [[ -f "$f" ]] && run_sql "$f"
done

for f in "$WORK"/sql/[0-9]*.sql; do
  base="$(basename "$f")"
  [[ "$base" == 000* ]] && continue
  run_sql "$f"
done

[[ -f "$WORK/docs/migrations/scan_image_phashes.sql" ]] && run_sql "$WORK/docs/migrations/scan_image_phashes.sql"

for f in "$WORK"/supabase/migrations/*.sql; do
  run_sql "$f"
done

sudo -u postgres psql -d "$DB" <<'EOF'
GRANT USAGE ON SCHEMA public TO web_anon;
GRANT ALL ON ALL TABLES IN SCHEMA public TO web_anon;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO web_anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO web_anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO web_anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO web_anon;

-- banned_users เป็น append-only (Codex รอบ 4): bulk GRANT ALL ข้างบนห้ามเปิดสิทธิ์
-- ตารางนี้กลับ — บีบเหลือ SELECT/INSERT + UPDATE เฉพาะคอลัมน์ unban เสมอ
DO $$ BEGIN
  IF to_regclass('public.banned_users') IS NOT NULL THEN
    REVOKE ALL PRIVILEGES ON banned_users FROM web_anon;
    REVOKE ALL PRIVILEGES ON banned_users FROM service_role;
    GRANT SELECT, INSERT ON banned_users TO web_anon;
    GRANT UPDATE (unbanned_by, unbanned_at, unban_reason) ON banned_users TO web_anon;
    GRANT SELECT, INSERT ON banned_users TO service_role;
    GRANT UPDATE (unbanned_by, unbanned_at, unban_reason) ON banned_users TO service_role;
  END IF;
END $$;

-- scan_quota_decrements: mutation ผ่าน RPC เท่านั้น (Codex B2 รอบสาม) — bulk GRANT
-- ALL ข้างบนห้ามเปิดสิทธิ์เขียนตรงกลับ (055 REVOKE ไว้แล้ว แต่ script นี้รันทีหลัง)
DO $$ BEGIN
  IF to_regclass('public.scan_quota_decrements') IS NOT NULL THEN
    REVOKE ALL PRIVILEGES ON scan_quota_decrements FROM web_anon;
    REVOKE ALL PRIVILEGES ON scan_quota_decrements FROM service_role;
    GRANT SELECT ON scan_quota_decrements TO web_anon;
    GRANT SELECT ON scan_quota_decrements TO service_role;
  END IF;
END $$;
EOF

echo "==> table count"
sudo -u postgres psql -d "$DB" -tAc \
  "SELECT count(*) FROM pg_tables WHERE schemaname = 'public';"
