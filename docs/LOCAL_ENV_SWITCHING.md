# Local Env Switching (Safe for Railway)

## How env file selection works

`src/config/env.js` now chooses env source in this order:

1. If running on Railway (`RAILWAY_ENVIRONMENT_NAME` or `RAILWAY_PROJECT_ID` or `RAILWAY_PUBLIC_DOMAIN` exists):
   - use Railway `process.env` only
   - do not load any local env file
2. If local:
   - if `ENV_FILE` is set, try that file first
   - else if `APP_ENV=staging`, try `.env.staging`
   - else if `APP_ENV=prod|production`, try `.env.prod`
   - else use `.env`
   - fallback to `.env` when target file is missing
   - if no file exists, continue with existing `process.env`

The loader prints a safe startup log (no secrets):

- `runningEnvSource`: `railway` | `file` | `process`
- `envFileUsed`: `.env` | `.env.staging` | `.env.prod` | `none`
- `appEnv`: `local` | `staging` | `production`

## When to use each file

- `.env`: default local development
- `.env.staging`: local run against staging services
- `.env.prod`: local run against production services (use carefully)

## Commands

### Local app

- default local: `npm run dev`
- force local profile: `npm run dev:local`
- staging profile: `npm run dev:staging`
- production profile: `npm run dev:prod`

### Scripts

- backfill phash (staging): `npm run backfill:phash:staging`
- backfill phash (prod): `npm run backfill:phash:prod`
- verify payment (staging): `npm run payment:verify:staging`
- verify payment (prod): `npm run payment:verify:prod`

Both `backfillScanPhashes.js` and `verify-payment.js` include a hard guard:

- if `APP_ENV=staging`, `envFileUsed` must be `.env.staging`
- if `APP_ENV=production`, `envFileUsed` must be `.env.prod`

Otherwise script exits with `ENV_GUARD_BLOCKED`.

### Explicit file override

If needed, override directly:

- `cross-env ENV_FILE=.env.staging node scripts/backfillScanPhashes.js`

## Why Railway production is not affected

On Railway, env loading is locked to runtime `process.env` and local files are never loaded, so local `.env*` files cannot override production deploy variables.
