#!/usr/bin/env bash
# Nightly PostgreSQL backup: pg_dump โ’ gzip โ’ optional R2/B2 upload โ’ retention prune.
#
# Setup:
#   sudo mkdir -p /etc/ener-scan /var/backups/ener-scan-pg
#   sudo cp config/pg-backup.env.example /etc/ener-scan/pg-backup.env
#   sudo chmod 600 /etc/ener-scan/pg-backup.env
#   # edit credentials + UPLOAD_MODE
#   sudo bash scripts/ops/install-pg-backup-cron.sh
#
# Manual run:
#   sudo /etc/ener-scan/pg-backup.env bash -c 'source /etc/ener-scan/pg-backup.env && /root/ener-scan/scripts/ops/pg-backup.sh'
#   # or:
#   sudo bash -c 'set -a; source /etc/ener-scan/pg-backup.env; set +a; /root/ener-scan/scripts/ops/pg-backup.sh'

set -euo pipefail

ENV_FILE="${PG_BACKUP_ENV:-/etc/ener-scan/pg-backup.env}"
if [[ -f "${ENV_FILE}" ]]; then
  # shellcheck disable=SC1090
  set -a
  source "${ENV_FILE}"
  set +a
fi

PG_DATABASES="${PG_DATABASES:-ener_scan_pro ener_scan}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/ener-scan-pg}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
UPLOAD_MODE="${UPLOAD_MODE:-none}"
S3_BUCKET="${S3_BUCKET:-}"
S3_PREFIX="${S3_PREFIX:-postgres}"
RCLONE_REMOTE="${RCLONE_REMOTE:-}"

DATE_STAMP="$(date -u +%Y%m%d)"
DAY_DIR="${BACKUP_DIR}/${DATE_STAMP}"
LOG_TAG="[pg-backup ${DATE_STAMP}]"

log() {
  echo "${LOG_TAG} $*"
}

die() {
  log "ERROR: $*"
  exit 1
}

mkdir -p "${DAY_DIR}"

prune_local() {
  local db="$1"
  find "${BACKUP_DIR}" -type f -name "${db}_*.sql.gz" -mtime +"${RETENTION_DAYS}" -delete 2>/dev/null || true
}

upload_aws() {
  local file="$1"
  local base
  base="$(basename "${file}")"
  [[ -n "${S3_BUCKET}" ]] || die "S3_BUCKET not set for UPLOAD_MODE=aws"
  command -v aws >/dev/null 2>&1 || die "aws CLI not installed"
  local key="${S3_PREFIX%/}/${DATE_STAMP}/${base}"
  log "upload aws s3://${S3_BUCKET}/${key}"
  aws s3 cp "${file}" "s3://${S3_BUCKET}/${key}" --only-show-errors
}

upload_rclone() {
  local file="$1"
  [[ -n "${RCLONE_REMOTE}" ]] || die "RCLONE_REMOTE not set for UPLOAD_MODE=rclone"
  command -v rclone >/dev/null 2>&1 || die "rclone not installed"
  log "upload rclone ${RCLONE_REMOTE}/${DATE_STAMP}/"
  rclone copyto "${file}" "${RCLONE_REMOTE%/}/${DATE_STAMP}/$(basename "${file}")" --stats-one-line
}

prune_remote() {
  case "${UPLOAD_MODE}" in
    aws)
      command -v aws >/dev/null 2>&1 || return 0
      [[ -n "${S3_BUCKET}" ]] || return 0
      # List and delete objects older than RETENTION_DAYS under prefix (best-effort).
      local cutoff
      cutoff="$(date -u -d "-${RETENTION_DAYS} days" +%Y%m%d 2>/dev/null || date -u -v-"${RETENTION_DAYS}"d +%Y%m%d 2>/dev/null || true)"
      [[ -n "${cutoff}" ]] || return 0
      aws s3 ls "s3://${S3_BUCKET}/${S3_PREFIX%/}/" --recursive 2>/dev/null | while read -r _ _ _ key; do
        day="$(echo "${key}" | cut -d/ -f2)"
        if [[ "${day}" =~ ^[0-9]{8}$ ]] && [[ "${day}" -lt "${cutoff}" ]]; then
          aws s3 rm "s3://${S3_BUCKET}/${key}" --only-show-errors || true
        fi
      done
      ;;
    rclone)
      command -v rclone >/dev/null 2>&1 || return 0
      [[ -n "${RCLONE_REMOTE}" ]] || return 0
      rclone delete "${RCLONE_REMOTE%/}" --min-age "${RETENTION_DAYS}d" --rmdirs 2>/dev/null || true
      ;;
  esac
}

dump_database() {
  local db="$1"
  local out="${DAY_DIR}/${db}_${DATE_STAMP}.sql.gz"
  local tmp="${out}.partial"

  log "dump ${db} -> ${out}"
  if ! sudo -u postgres pg_dump --no-owner --no-acl -d "${db}" | gzip -9 >"${tmp}"; then
    rm -f "${tmp}"
    die "pg_dump failed for ${db}"
  fi
  mv "${tmp}" "${out}"
  local size
  size="$(du -h "${out}" | awk '{print $1}')"
  log "done ${db} (${size})"

  case "${UPLOAD_MODE}" in
    aws) upload_aws "${out}" ;;
    rclone) upload_rclone "${out}" ;;
    none) log "upload skipped (UPLOAD_MODE=none)" ;;
    *) die "unknown UPLOAD_MODE=${UPLOAD_MODE}" ;;
  esac

  prune_local "${db}"
}

main() {
  log "start databases=${PG_DATABASES} upload=${UPLOAD_MODE} retention=${RETENTION_DAYS}d"
  for db in ${PG_DATABASES}; do
    dump_database "${db}"
  done
  prune_remote || log "remote prune warning (non-fatal)"
  log "complete"
}

main "$@"
