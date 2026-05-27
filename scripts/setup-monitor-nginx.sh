#!/usr/bin/env bash
# Nginx reverse proxy + Let's Encrypt for monitor.my-ener.uk (OTP proxy :8081).
# Prereq: DNS A record; monitor-proxy listening on 127.0.0.1:8081.

set -euo pipefail

ROOT="${1:-/root/ener-scan}"
DOMAIN="${MONITOR_DOMAIN:-monitor.my-ener.uk}"
UPSTREAM="${MONITOR_UPSTREAM:-http://127.0.0.1:8081}"
SITE_AVAILABLE="/etc/nginx/sites-available/monitor.my-ener.uk"
SITE_ENABLED="/etc/nginx/sites-enabled/monitor.my-ener.uk"
LEGACY_SITE="/etc/nginx/sites-enabled/monitor-dozzle"
CERTBOT_EMAIL="${CERTBOT_EMAIL:-}"

echo "==> Checking DNS for ${DOMAIN}"
resolved="$(getent ahostsv4 "${DOMAIN}" 2>/dev/null | awk '{print $1}' | head -1 || true)"
if [[ -z "${resolved}" ]]; then
  echo "WARN: ${DOMAIN} does not resolve yet. Add DNS A record, wait for propagation, then re-run."
  echo "      Example: monitor.my-ener.uk -> $(curl -4 -s ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')"
else
  echo "    resolves to: ${resolved}"
fi

if [[ -f "${ROOT}/config/nginx/monitor.my-ener.uk.conf" ]] && [[ -d "/etc/letsencrypt/live/${DOMAIN}" ]]; then
  echo "==> Installing SSL nginx config from repo"
  cp "${ROOT}/config/nginx/monitor.my-ener.uk.conf" "${SITE_AVAILABLE}"
  ln -sf "${SITE_AVAILABLE}" "${SITE_ENABLED}"
  rm -f "${LEGACY_SITE}" 2>/dev/null || true
  nginx -t
  systemctl reload nginx
  echo "==> Done: https://${DOMAIN} -> ${UPSTREAM}"
  exit 0
fi

echo "==> Writing nginx site (HTTP โ’ ${UPSTREAM})"
cat >"${SITE_AVAILABLE}" <<EOF
server {
    listen 80;
    server_name ${DOMAIN};

    location / {
        proxy_pass ${UPSTREAM};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 3600;
        proxy_buffering off;
    }
}
EOF

ln -sf "${SITE_AVAILABLE}" "${SITE_ENABLED}"
rm -f "${LEGACY_SITE}" 2>/dev/null || true
nginx -t
systemctl reload nginx

if [[ ! -d "/etc/letsencrypt/live/${DOMAIN}" ]]; then
  echo "==> Requesting TLS certificate (certbot --nginx)"
  certbot_args=(--nginx -d "${DOMAIN}" --non-interactive --agree-tos --redirect)
  if [[ -n "${CERTBOT_EMAIL}" ]]; then
    certbot_args+=(--email "${CERTBOT_EMAIL}")
  else
    certbot_args+=(--register-unsafely-without-email)
  fi
  if ! certbot "${certbot_args[@]}"; then
    echo "WARN: certbot failed (often DNS not ready). HTTP proxy is up; re-run after A record propagates."
    exit 1
  fi
else
  echo "==> Certificate already exists for ${DOMAIN}"
fi

if [[ -f "${ROOT}/config/nginx/monitor.my-ener.uk.conf" ]]; then
  echo "==> Upgrading to SSL config with monitor-proxy upstream"
  cp "${ROOT}/config/nginx/monitor.my-ener.uk.conf" "${SITE_AVAILABLE}"
fi

nginx -t
systemctl reload nginx
echo "==> Done: https://${DOMAIN} -> ${UPSTREAM}"
