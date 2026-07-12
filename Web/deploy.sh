#!/bin/bash
# Deploy Ener Scan Lovable site (Next.js static export) → my-ener.uk
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SITE_DIR="${ROOT}/Web/ener-scan-website"
OUT_DIR="${SITE_DIR}/out"
WEB_DST="/var/www/ener-scan-web"
NGINX_SRC="${ROOT}/config/nginx/my-ener.uk.conf"
NGINX_DST="/etc/nginx/sites-available/ener-scan-web"
NGINX_ENABLED="/etc/nginx/sites-enabled/ener-scan-web"
OLD_ENER_AI="/etc/nginx/sites-enabled/ener-ai"

if [[ ! -d "${SITE_DIR}" ]]; then
  echo "Missing ${SITE_DIR}" >&2
  exit 1
fi

echo "== Build Next.js static site =="
cd "${SITE_DIR}"
if [[ ! -d node_modules ]]; then
  npm ci
fi
npm run build

if [[ ! -d "${OUT_DIR}" ]]; then
  echo "Build did not produce ${OUT_DIR}" >&2
  exit 1
fi

echo "== Deploy ${OUT_DIR} → ${WEB_DST} =="
mkdir -p "${WEB_DST}"
rsync -av --delete "${OUT_DIR}/" "${WEB_DST}/"
chown -R www-data:www-data "${WEB_DST}"
chmod -R a+rX "${WEB_DST}"

echo "== Install nginx site =="
cp "${NGINX_SRC}" "${NGINX_DST}"
ln -sf "${NGINX_DST}" "${NGINX_ENABLED}"

if [[ -L "${OLD_ENER_AI}" ]] || [[ -f "${OLD_ENER_AI}" ]]; then
  echo "== Disable old ener-ai site on my-ener.uk =="
  rm -f "${OLD_ENER_AI}"
fi

nginx -t
systemctl reload nginx

echo "== Done. Check https://my-ener.uk/ =="
