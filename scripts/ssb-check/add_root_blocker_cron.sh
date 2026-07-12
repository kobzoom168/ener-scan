#!/usr/bin/env bash
set -eu
LINE='*/10 * * * * /usr/bin/flock -n /tmp/mssql_root_blocker_watch.lock bash -c "cd /home/tanarit/SSB-Check && ./run_with_env.sh python3 mssql_root_blocker_watch.py >> logs/cron_root_blocker_watch.log 2>&1"'
if crontab -l 2>/dev/null | grep -Fq mssql_root_blocker_watch.py; then
  echo "ALREADY_EXISTS"
else
  (crontab -l 2>/dev/null; echo "$LINE") | crontab -
  echo "CRON_ADDED"
fi
crontab -l | grep mssql_root_blocker_watch.py || true
