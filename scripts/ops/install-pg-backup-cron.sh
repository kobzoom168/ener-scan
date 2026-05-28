#!/usr/bin/env bash
# One-time: directories, env file stub, cron @ 03:15 UTC daily.
set -euo pipefail

REPO="${1:-/root/ener-scan}"
ENV_DEST="/etc/ener-scan/pg-backup.env"
BACKUP_DIR="/var/backups/ener-scan-pg"
CRON_LINE="15 3 * * * root set -a && . ${ENV_DEST} && set +a && ${REPO}/scripts/ops/pg-backup.sh >> /var/log/ener-scan-pg-backup.log 2>&1"
CRON_FILE="/etc/cron.d/ener-scan-pg-backup"

mkdir -p /etc/ener-scan "${BACKUP_DIR}"
touch /var/log/ener-scan-pg-backup.log
chmod 640 /var/log/ener-scan-pg-backup.log

if [[ ! -f "${ENV_DEST}" ]]; then
  cp "${REPO}/config/pg-backup.env.example" "${ENV_DEST}"
  chmod 600 "${ENV_DEST}"
  echo "Created ${ENV_DEST} โ€” edit UPLOAD_MODE and cloud credentials before relying on off-site backup."
else
  echo "Keeping existing ${ENV_DEST}"
fi

chmod +x "${REPO}/scripts/ops/pg-backup.sh"

cat >"${CRON_FILE}" <<EOF
# Ener Scan PostgreSQL backup (both ener_scan_pro + ener_scan)
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin
${CRON_LINE}
EOF

chmod 644 "${CRON_FILE}"
echo "Installed ${CRON_FILE}"
echo "Test now: sudo bash -c 'set -a; source ${ENV_DEST}; set +a; ${REPO}/scripts/ops/pg-backup.sh'"
