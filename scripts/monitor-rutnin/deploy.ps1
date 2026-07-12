# Deploy FTP monitor patch to rutnin server (prompts for SSH password)
$ErrorActionPreference = "Stop"

$HostName = "172.25.41.121"
$RemoteDir = "/home/tanarit/monitor-rutnin.com"
$LocalDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "==> Uploading patch files to ${HostName}:${RemoteDir}"
scp "$LocalDir\ftp_listing_diff.py" "$LocalDir\apply_server_patch.py" "root@${HostName}:${RemoteDir}/"

Write-Host "==> Applying patch and testing"
ssh "root@${HostName}" @"
set -e
cd ${RemoteDir}
cp monitor.py monitor.py.bak.\$(date +%Y%m%d_%H%M%S) 2>/dev/null || true
./venv/bin/python apply_server_patch.py
./venv/bin/python -m py_compile monitor.py ftp_listing_diff.py
./venv/bin/python monitor.py
echo 'Deploy OK'
"@

Write-Host "==> Done. Next cron run will use filename-based alerts."
