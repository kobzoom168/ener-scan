# PostgreSQL automated backup (Hetzner)

Production data lives in local PostgreSQL (`ener_scan_pro`, `ener_scan`). Supabase no longer provides managed backups after Phase 2B.

## What runs

| Item | Value |
|------|--------|
| Script | `scripts/ops/pg-backup.sh` |
| Config | `/etc/ener-scan/pg-backup.env` |
| Schedule | Daily **03:15 UTC** (`/etc/cron.d/ener-scan-pg-backup`) |
| Local path | `/var/backups/ener-scan-pg/YYYYMMDD/` |
| Retention | 7 days (local + remote when upload enabled) |
| Format | `pg_dump` plain SQL, `gzip -9` |

## One-time setup on server

```bash
cd /root/ener-scan
git pull
sudo bash scripts/ops/install-pg-backup-cron.sh
sudo nano /etc/ener-scan/pg-backup.env   # set UPLOAD_MODE + credentials
```

### Manual test (local only)

```bash
sudo bash -c 'set -a; source /etc/ener-scan/pg-backup.env; set +a; /root/ener-scan/scripts/ops/pg-backup.sh'
ls -lh /var/backups/ener-scan-pg/*/
tail -50 /var/log/ener-scan-pg-backup.log
```

### Restore example

```bash
gunzip -c /var/backups/ener-scan-pg/20260528/ener_scan_pro_20260528.sql.gz \
  | sudo -u postgres psql -d ener_scan_pro_restore
```

Use a fresh database name for dry-run restores; avoid overwriting production without a maintenance window.

## Off-site upload

### Option A — Cloudflare R2 (recommended)

1. R2 bucket + API token (Object Read & Write).
2. Install AWS CLI: `apt install -y awscli`
3. In `/etc/ener-scan/pg-backup.env`:

```bash
UPLOAD_MODE=aws
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_ENDPOINT_URL=https://<account_id>.r2.cloudflarestorage.com
AWS_DEFAULT_REGION=auto
S3_BUCKET=ener-scan-backups
S3_PREFIX=postgres
```

### Option B — Backblaze B2

Same as R2; set `AWS_ENDPOINT_URL` to your B2 S3 endpoint.

### Option C — rclone

```bash
UPLOAD_MODE=rclone
RCLONE_REMOTE=r2:ener-scan-backups/postgres
```

## Monitoring

- Log: `/var/log/ener-scan-pg-backup.log`
- Alert if today's directory is missing:

```bash
test -d "/var/backups/ener-scan-pg/$(date -u +%Y%m%d)" || echo "BACKUP MISSING"
```

## Notes

- `docker compose restart` does not reload env; use `docker compose up -d` after `.env` changes.
- Backup both `ener_scan_pro` (production) and `ener_scan` (test).
- Until `UPLOAD_MODE` is not `none`, dumps exist only on the VPS disk — still better than nothing, but add R2/B2 for disaster recovery.
