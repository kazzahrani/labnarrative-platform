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

# Bybit traffic must use the hardened IPv4 curl transport already used for OKX/KuCoin.
# Vercel/Supabase US egress is restricted by Bybit, while Node/Undici on the Riyadh
# gateway can intermittently hang. GETs retain one safe retry; POST/DELETE writes are
# never retried by curlRequestIpv4.
BYBIT_IPV4_BEFORE='if (origin === ORIGINS.kucoin || origin === ORIGINS.okx) {'
BYBIT_IPV4_AFTER='if (origin === ORIGINS.kucoin || origin === ORIGINS.okx || origin === ORIGINS.bybit) {'
if grep -Fq "$BYBIT_IPV4_BEFORE" "$INSTALL_ROOT/server.mjs"; then
  sudo sed -i "s/if (origin === ORIGINS\.kucoin || origin === ORIGINS\.okx) {/if (origin === ORIGINS.kucoin || origin === ORIGINS.okx || origin === ORIGINS.bybit) {/" "$INSTALL_ROOT/server.mjs"
fi
if ! grep -Fq "$BYBIT_IPV4_AFTER" "$INSTALL_ROOT/server.mjs"; then
  echo "Bybit IPv4 gateway transport patch could not be applied safely." >&2
  exit 1
fi

# Install one deliberately narrow unauthenticated market-data route for chart candles.
# It cannot reach private/account/order APIs: GET only, Bybit Spot only, USDT only,
# known kline intervals only, max 1,000 rows. The generic relay remains ECDSA-signed.
if ! grep -Fq 'PUBLIC_BYBIT_KLINE_V1' "$INSTALL_ROOT/server.mjs"; then
  sudo SERVER_FILE="$INSTALL_ROOT/server.mjs" node <<'NODE'
const fs = require("node:fs");
const file = process.env.SERVER_FILE;
let source = fs.readFileSync(file, "utf8");

const serverAnchor = 'const server = http.createServer(async (req, res) => {';
if (!source.includes(serverAnchor)) throw new Error("Public Bybit kline: server anchor missing");

const helper = `// PUBLIC_BYBIT_KLINE_V1 — public market data only; no account/order access.\nconst PUBLIC_BYBIT_KLINE_INTERVALS = new Set(["3", "5", "15", "60", "240", "D", "W", "M"]);\nconst publicBybitKline = async (req, res) => {\n  const requestUrl = new URL(req.url || "/", "http://gateway.local");\n  const params = requestUrl.searchParams;\n  const allowed = new Set(["symbol", "interval", "limit", "end"]);\n  for (const key of params.keys()) if (!allowed.has(key)) throw Object.assign(new Error("query_parameter_not_allowed"), { status: 403 });\n  const symbol = params.get("symbol") || "";\n  if (!usdtSymbol(symbol)) throw Object.assign(new Error("usdt_spot_only"), { status: 403 });\n  const interval = params.get("interval") || "";\n  if (!PUBLIC_BYBIT_KLINE_INTERVALS.has(interval)) throw Object.assign(new Error("invalid_interval"), { status: 400 });\n  const limit = Number(params.get("limit") || "200");\n  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw Object.assign(new Error("invalid_limit"), { status: 400 });\n  const end = params.get("end");\n  if (end && !/^\\d{10,16}$/.test(end)) throw Object.assign(new Error("invalid_end"), { status: 400 });\n\n  const upstreamParams = new URLSearchParams({ category: "spot", symbol, interval, limit: String(limit) });\n  if (end) upstreamParams.set("end", end);\n  const upstream = await curlRequestIpv4(\`${ORIGINS.bybit}/v5/market/kline?\${upstreamParams.toString()}\`, {\n    method: "GET", headers: { accept: "application/json" }, body: undefined, timeoutMs: REQUEST_TIMEOUT_MS,\n  });\n  console.log(JSON.stringify({ event: "public_bybit_kline", symbol, interval, limit, status: upstream.status }));\n  res.writeHead(upstream.status, {\n    "content-type": "application/json; charset=utf-8",\n    "cache-control": "no-store",\n    "x-content-type-options": "nosniff",\n  });\n  res.end(upstream.body);\n};\n\n`;
source = source.replace(serverAnchor, helper + serverAnchor);

const getBefore = `    // GET is public health only; POST is signature-gated and origin/method/path/header allowlisted.\n    if (req.method === "GET") {\n      const ip = await refreshEgressIp();\n      return json(res, 200, {\n        ok: true,\n        service: "labnarrative-trader-gateway",\n        auth: "ecdsa-p256",\n        egressIp: ip,\n        providers: Object.keys(ORIGINS),\n      });\n    }`;
const getAfter = `    // GET exposes health plus one strict, read-only Bybit Spot kline route.\n    // POST remains signature-gated and origin/method/path/header allowlisted.\n    if (req.method === "GET") {\n      const requestUrl = new URL(req.url || "/", "http://gateway.local");\n      if (requestUrl.pathname === "/public/bybit/kline") return await publicBybitKline(req, res);\n      const ip = await refreshEgressIp();\n      return json(res, 200, {\n        ok: true,\n        service: "labnarrative-trader-gateway",\n        auth: "ecdsa-p256",\n        egressIp: ip,\n        providers: Object.keys(ORIGINS),\n      });\n    }`;
if (!source.includes(getBefore)) throw new Error("Public Bybit kline: GET health anchor missing");
source = source.replace(getBefore, getAfter);
if (!source.includes("PUBLIC_BYBIT_KLINE_V1") || !source.includes('requestUrl.pathname === "/public/bybit/kline"')) throw new Error("Public Bybit kline patch did not apply");
fs.writeFileSync(file, source);
NODE
fi

if ! grep -Fq 'PUBLIC_BYBIT_KLINE_V1' "$INSTALL_ROOT/server.mjs"; then
  echo "Public Bybit kline gateway patch could not be applied safely." >&2
  exit 1
fi

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
Environment=NODE_OPTIONS=--dns-result-order=ipv4first
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
