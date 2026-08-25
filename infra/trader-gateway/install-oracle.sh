#!/usr/bin/env bash
set -euo pipefail

REPO_URL="https://github.com/kazzahrani/labnarrative-platform.git"
INSTALL_ROOT="/opt/labnarrative-trader-gateway"
REPO_DIR="$INSTALL_ROOT/repo"

export DEBIAN_FRONTEND=noninteractive
sudo apt-get update
sudo apt-get install -y ca-certificates curl git iptables-persistent

if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sudo sh
fi
sudo systemctl enable --now docker

sudo mkdir -p "$INSTALL_ROOT"
sudo chown -R "$USER":"$USER" "$INSTALL_ROOT"

if [ -d "$REPO_DIR/.git" ]; then
  git -C "$REPO_DIR" fetch --depth 1 origin main
  git -C "$REPO_DIR" reset --hard origin/main
else
  git clone --depth 1 --branch main "$REPO_URL" "$REPO_DIR"
fi

# OCI Ubuntu images can also have a host firewall in addition to the VCN security list.
if ! sudo iptables -C INPUT -p tcp --dport 8080 -j ACCEPT 2>/dev/null; then
  sudo iptables -I INPUT 1 -p tcp --dport 8080 -j ACCEPT
fi
sudo netfilter-persistent save >/dev/null 2>&1 || true

cd "$REPO_DIR/infra/trader-gateway"
sudo docker compose down --remove-orphans || true
sudo docker compose up -d --build

sleep 3
curl -fsS http://127.0.0.1:8080/health
printf '\nGateway installed.\n'
