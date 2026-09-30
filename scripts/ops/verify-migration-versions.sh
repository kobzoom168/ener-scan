#!/usr/bin/env bash
# ตรวจ "exact version" ของฟังก์ชัน migration บน DB เป้าหมาย ด้วย md5(prosrc) เทียบไฟล์อ้างอิง (read-only)
# ใช้: sudo -u postgres bash scripts/ops/verify-migration-versions.sh <dbname>
set -euo pipefail
DB="${1:?dbname}"; REF="$(dirname "$0")/migration-function-md5.reference.txt"
fail=0
while read -r name md5; do
  [[ -z "$name" || "$name" == \#* ]] && continue
  actual=$(psql -d "$DB" -Atc "select md5(prosrc) from pg_proc where proname='$name' order by oid desc limit 1")
  n=$(psql -d "$DB" -Atc "select count(*) from pg_proc where proname='$name'")
  if [[ -z "$actual" ]]; then echo "MISSING  $name"; fail=1
  elif [[ "$n" != "1" ]]; then echo "OVERLOAD $name (count=$n)"; fail=1
  elif [[ "$actual" != "$md5" ]]; then echo "DIFF     $name expected=$md5 actual=$actual"; fail=1
  else echo "OK       $name"; fi
done < "$REF"
exit $fail
