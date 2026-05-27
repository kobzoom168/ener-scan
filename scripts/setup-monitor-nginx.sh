#!/usr/bin/env bash
# Nginx reverse proxy + Let's Encrypt for Dozzle at monitor.my-ener.uk
# Prereq: DNS A record monitor.my-ener.uk -> this server; dozzle on 127.0.0.1:8080

set -euo pipefail

DOMAIN="${MONITOR_DOMAIN:-monitor.my-ener.uk}"
UPSTREAM="${DOZZLE_UPSTREAM:-http://127.0.0.1:8080}"
SITE_AVAILABLE="/etc/nginx/sites-available/monitor-dozzle"
SITE_ENABLED="/etc/nginx/sites-enabled/monitor-dozzle"
CERTBOT_EMAIL="${CERTBOT_EMAIL:-}"

echo "==> Checking DNS for ${DOMAIN}"
resolved="$(getent ahostsv4 "${DOMAIN}" 2>/dev/null | awk '{print $1}' | head -1 || true)"
if [[ -z "${resolved}" ]]; then
  echo "WARN: ${DOMAIN} does not resolve yet. Add DNS A record, wait for propagation, then re-run."
  echo "      Example: monitor.my-ener.uk -> $(curl -4 -s ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')"
else
  echo "    resolves to: ${resolved}"
fi

echo "==> Writing nginx site (HTTP)"
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
        proxy_read_timeout 3600s;
    }
}
EOF

ln -sf "${SITE_AVAILABLE}" "${SITE_ENABLED}"
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
    echo "WARN: certbot failed (often DNS not ready). HTTP proxy is up; re-run this script after the A record propagates."
    exit 1
  fi
else
  echo "==> Certificate already exists for ${DOMAIN}"
fi

nginx -t
systemctl reload nginx
echo "==> Done: https://${DOMAIN} -> ${UPSTREAM}"
