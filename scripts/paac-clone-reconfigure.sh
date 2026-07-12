#!/usr/bin/env bash
# Reconfigure PAAC VM clone: IP + hostname + identity + app refs
# Run as root on DCM4CHEE_V2 via vSphere Web Console (or SSH)
set -euo pipefail

NEW_IP="172.25.41.72"
NEW_HOST="paac-ubuntu19_V2"
OLD_IP="172.25.41.19"
OLD_HOST="paac-ubuntu19"
SSH_PUBKEY='ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAACAQC5HSzXI9plKwrnCcT/0e0T8u5ShVwS+Y6i1WEJ312GiL5sZnWl5zaEmhcx3GiZUI8UtVFKMOk9dpD1VKTzxwnRWnpGOOIYAVXMIetEFBsP4zBuYvWq+FPiKR7ZVyMTiYx51gXe2m+HLb1+pyP3rwasvpwi1pW5fhC8IiP+wBbUUuyvMB9pt/K9HN/gGSwYD9Cr557dTBCdJWFTGiby9H1vdanhXW89l5U6sTcju8UEMwViFIC45Q63gjLCdLT1RASV/33i5GuClIyJJysOE6N++VlmMZCok/wz5O6Z2goVHxS8Y+2cMIcFIbC+dSd0krcDnMlHfKfvb6cFlkM548unHcRonqnUrrKlU4iuSG+XPa2Dw6w/OxSG2UweqqYLlhGnXEjkOfmgcmPRTOs0pKuQ8D3LUeSEVNacMgW7YfClj6Q9deQuSDVdh3JsUQI6MvqSBf8l7IIcD4w77WZ3DyrOctvt4mCOUUgqwUtULuZF5d7SzHWBhIdNWNDW44BT5KwE32AaVEEPoG+w31QtghBBksv5CXjK+v9Z7IStaEKKR8mAAAtdvZgAGeIl6/zG0LmkyND72jOI3U+xnLAstao4AVM9DEOnXV/5m9fXgHg7QVvAm/F+lJwazbAEibUCziZeEstAsumnIsh5HehzLnrIaubaFNk2HhZFDK+gZd/3rw== rutningroup\ta168023@ITNB68013_1'

echo "== PAAC clone reconfigure: ${OLD_IP}/${OLD_HOST} -> ${NEW_IP}/${NEW_HOST} =="

mkdir -p /root/.ssh
chmod 700 /root/.ssh
grep -qF "$SSH_PUBKEY" /root/.ssh/authorized_keys 2>/dev/null || echo "$SSH_PUBKEY" >> /root/.ssh/authorized_keys
chmod 600 /root/.ssh/authorized_keys

echo "$NEW_HOST" > /etc/hostname
hostnamectl set-hostname "$NEW_HOST"

sed -i "s/${OLD_HOST}/${NEW_HOST}/g" /etc/hosts
grep -q "${NEW_HOST}" /etc/hosts || echo "127.0.1.1 ${NEW_HOST}" >> /etc/hosts

if [ -f /etc/netplan/50-cloud-init.yaml ]; then
  sed -i "s/${OLD_IP}/${NEW_IP}/g" /etc/netplan/50-cloud-init.yaml
fi

rm -f /etc/machine-id /var/lib/dbus/machine-id
systemd-machine-id-setup
ln -sf /etc/machine-id /var/lib/dbus/machine-id

rm -f /etc/ssh/ssh_host_*
ssh-keygen -A

for f in /etc/nginx/sites-available/paac /etc/nginx/sites-enabled/paac; do
  [ -f "$f" ] && sed -i "s/${OLD_IP}/${NEW_IP}/g" "$f"
done

[ -f /etc/iptables/rules.v4 ] && sed -i "s/${OLD_IP}/${NEW_IP}/g" /etc/iptables/rules.v4

replace_in_file() {
  local f="$1"
  [ -f "$f" ] || return 0
  sed -i "s/${OLD_IP}/${NEW_IP}/g" "$f"
  sed -i "s/${OLD_HOST}/${NEW_HOST}/g" "$f"
}

replace_in_file /opt/paac/tools/eyesuite-agent-room01.json
replace_in_file /opt/paac/app/routers/web.py
replace_in_file /opt/paac/tools/pgadmin-main/config.local.php
replace_in_file /opt/paac/tools/pgadmin-main/docker-compose.paac.yml
replace_in_file /opt/paac/tools/pgadmin-main/.env.paac.example
replace_in_file /opt/paac/pentacam/MWL_PRESET_PENTACAM.txt
replace_in_file /opt/paac/docs/deployment/proxy/nginx-paac-http-dev.conf

if [ -f /etc/orthanc/orthanc.json ]; then
  python3 - <<'PY'
import json
path = "/etc/orthanc/orthanc.json"
with open(path, encoding="utf-8") as f:
    data = json.load(f)
if data.get("DicomAet") == "ORTHANC":
    data["DicomAet"] = "ORTHANC_V2"
with open(path, "w", encoding="utf-8") as f:
    json.dump(data, f, indent=2)
    f.write("\n")
print("Orthanc DicomAet:", data.get("DicomAet"))
PY
fi

nginx -t

if command -v netfilter-persistent >/dev/null 2>&1 && [ -f /etc/iptables/rules.v4 ]; then
  netfilter-persistent reload || iptables-restore < /etc/iptables/rules.v4 || true
fi

echo "Applying netplan (SSH on old IP may drop)..."
netplan apply

systemctl restart ssh
systemctl restart nginx || true
systemctl restart orthanc || true
systemctl restart paac.service || true

echo "== Done =="
hostname
ip -4 addr show ens160 | grep inet || true
echo "Verify: curl -sI http://${NEW_IP}/ | head -3"
