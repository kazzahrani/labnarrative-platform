#!/usr/bin/env bash
set -euo pipefail

INSTALL_ROOT="/opt/labnarrative-trader-gateway"
GATEWAY_REF="${GATEWAY_REF:-main}"
SERVER_URL="https://raw.githubusercontent.com/kazzahrani/labnarrative-platform/${GATEWAY_REF}/infra/trader-gateway/server.mjs"
SERVICE_FILE="/etc/systemd/system/labnarrative-trader-gateway.service"

export DEBIAN_FRONTEND=noninteractive
sudo apt-get update
sudo apt-get install -y ca-certificates curl nodejs iptables-persistent

sudo mkdir -p "$INSTALL_ROOT"
sudo curl -4 -fL --retry 5 --retry-delay 2 --connect-timeout 10 "$SERVER_URL" -o "$INSTALL_ROOT/server.mjs"
sudo chown -R ubuntu:ubuntu "$INSTALL_ROOT"
sudo chmod 0755 "$INSTALL_ROOT"
sudo chmod 0644 "$INSTALL_ROOT/server.mjs"

# OCI Ubuntu images can have a host firewall in addition to the VCN security list.
if ! sudo iptables -C INPUT -p tcp --dport 8080 -j ACCEPT 2>/dev/null; then
  sudo iptables -I INPUT 1 -p tcp --dport 8080 -j ACCEPT
fi
sudo netfilter-persistent save >/dev/null 2>&1 || true

sudo tee "$SERVICE_FILE" >/dev/null <<'EOF'
[Unit]
Description=LabNarrative Trader Gateway
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=ubuntu
Group=ubuntu
WorkingDirectory=/opt/labnarrative-trader-gateway
Environment=NODE_ENV=production
Environment=PORT=8080
ExecStart=/usr/bin/node /opt/labnarrative-trader-gateway/server.mjs
Restart=always
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable labnarrative-trader-gateway.service
# Always restart after replacing server.mjs so rerunning this script performs a real upgrade.
sudo systemctl restart labnarrative-trader-gateway.service

for _ in $(seq 1 20); do
  if curl -fsS --max-time 3 http://127.0.0.1:8080/health; then
    printf '\nGateway installed from ref %s.\n' "$GATEWAY_REF"
    exit 0
  fi
  sleep 1
done

sudo systemctl --no-pager --full status labnarrative-trader-gateway.service || true
sudo journalctl -u labnarrative-trader-gateway.service -n 50 --no-pager || true
exit 1
