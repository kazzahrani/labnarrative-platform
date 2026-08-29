import fs from "node:fs";
import path from "node:path";

const connectionsPath = path.join(process.cwd(), "app", "trader", "ConnectionsSettings.tsx");
const overviewPath = path.join(process.cwd(), "app", "trader", "OverviewCommandCenter.tsx");
if (!fs.existsSync(connectionsPath) || !fs.existsSync(overviewPath)) throw new Error("Coinbase connection targets missing");

let connections = fs.readFileSync(connectionsPath, "utf8");
let overview = fs.readFileSync(overviewPath, "utf8");
const marker = "COINBASE_CONNECTION_V1";

if (!connections.includes(marker)) {
  const importAnchor = 'import OkxConnectionCard from "./OkxConnectionCard";';
  if (!connections.includes(importAnchor)) throw new Error("Coinbase connection could not find OKX import anchor");
  connections = connections.replace(importAnchor, `${importAnchor}\nimport CoinbaseConnectionCard from "./CoinbaseConnectionCard"; // ${marker}`);

  const cardAnchor = '        <OkxConnectionCard realAccountAvailable={Boolean(realAccount)} />';
  if (!connections.includes(cardAnchor)) throw new Error("Coinbase connection could not find OKX card anchor");
  connections = connections.replace(cardAnchor, `${cardAnchor}\n        <CoinbaseConnectionCard realAccountAvailable={Boolean(realAccount)} />`);

  const plannedAnchor = '<div className={styles.plannedConnections}><span><b>Coinbase</b><small>Planned</small></span><span><b>Kraken</b><small>Planned</small></span><span><b>KuCoin</b><small>Planned</small></span></div>';
  if (!connections.includes(plannedAnchor)) throw new Error("Coinbase connection could not find planned-exchanges anchor");
  connections = connections.replace(plannedAnchor, '<div className={styles.plannedConnections}><span><b>Kraken</b><small>Planned</small></span><span><b>KuCoin</b><small>Planned</small></span></div>');

  const securityAnchor = 'Binance keeps its fixed-IP execution gateway and existing live-trading safeguards. Bybit and OKX are isolated read-only balance connections in this phase; write-enabled keys are rejected and LabNarrative does not send orders to either exchange.';
  if (!connections.includes(securityAnchor)) throw new Error("Coinbase connection could not find security-note anchor");
  connections = connections.replace(securityAnchor, 'Binance keeps its fixed-IP execution gateway and existing live-trading safeguards. Bybit, OKX, and Coinbase are isolated read-only connections in this phase; write/transfer-enabled keys are rejected and LabNarrative does not send orders to these exchanges.');
}

if (!overview.includes(marker)) {
  const stateAnchor = '  const [okxConnected, setOkxConnected] = useState(false); // OKX_OVERVIEW_HEALTH_V1';
  if (!overview.includes(stateAnchor)) throw new Error("Coinbase Overview health requires OKX health transform first");
  overview = overview.replace(stateAnchor, `${stateAnchor}\n  const [coinbaseConnected, setCoinbaseConnected] = useState(false); // ${marker}`);

  const loaderAnchor = `  const loadOkxStatus = useCallback(async () => {\n    try {\n      const { data, error } = await browserSupabase.functions.invoke("trader-okx-control", { body: { action: "status" } });\n      if (error) throw error;\n      const response = (data ?? {}) as ExchangeStatusResponse;\n      setOkxConnected(response.ok === true && response.connection?.status === "connected");\n    } catch {\n      setOkxConnected(false);\n    }\n  }, []);`;
  if (!overview.includes(loaderAnchor)) throw new Error("Coinbase Overview health could not find OKX loader anchor");
  const coinbaseLoader = `${loaderAnchor}\n\n  const loadCoinbaseStatus = useCallback(async () => {\n    try {\n      const { data, error } = await browserSupabase.functions.invoke("trader-coinbase-control", { body: { action: "status" } });\n      if (error) throw error;\n      const response = (data ?? {}) as ExchangeStatusResponse;\n      setCoinbaseConnected(response.ok === true && response.connection?.status === "connected");\n    } catch {\n      setCoinbaseConnected(false);\n    }\n  }, []);`;
  overview = overview.replace(loaderAnchor, coinbaseLoader);

  const effectAnchor = '  useEffect(() => { void loadBybitStatus(); void loadOkxStatus(); }, [account.id, loadBybitStatus, loadOkxStatus]);';
  if (!overview.includes(effectAnchor)) throw new Error("Coinbase Overview health could not find exchange-status effect");
  overview = overview.replace(effectAnchor, '  useEffect(() => { void loadBybitStatus(); void loadOkxStatus(); void loadCoinbaseStatus(); }, [account.id, loadBybitStatus, loadOkxStatus, loadCoinbaseStatus]);');

  const connectedAnchor = '  const anyConnectedExchange = hasConnectedExchange || bybitConnected || okxConnected;';
  if (!overview.includes(connectedAnchor)) throw new Error("Coinbase Overview health could not find connected-exchange expression");
  overview = overview.replace(connectedAnchor, '  const anyConnectedExchange = hasConnectedExchange || bybitConnected || okxConnected || coinbaseConnected;');

  const countAnchor = '  const connectedExchangeCount = Number(hasConnectedExchange) + Number(bybitConnected) + Number(okxConnected);';
  if (!overview.includes(countAnchor)) throw new Error("Coinbase Overview health could not find exchange count expression");
  overview = overview.replace(countAnchor, '  const connectedExchangeCount = Number(hasConnectedExchange) + Number(bybitConnected) + Number(okxConnected) + Number(coinbaseConnected);');

  const labelAnchor = '  const connectionHealthLabel = connectedExchangeCount > 1 ? `${connectedExchangeCount} exchanges connected` : hasConnectedExchange ? "Binance connected" : bybitConnected ? "Bybit connected · read only" : okxConnected ? "OKX connected · read only" : "Paper ready · no exchange";';
  if (!overview.includes(labelAnchor)) throw new Error("Coinbase Overview health could not find health-label expression");
  overview = overview.replace(labelAnchor, '  const connectionHealthLabel = connectedExchangeCount > 1 ? `${connectedExchangeCount} exchanges connected` : hasConnectedExchange ? "Binance connected" : bybitConnected ? "Bybit connected · read only" : okxConnected ? "OKX connected · read only" : coinbaseConnected ? "Coinbase connected · read only" : "Paper ready · no exchange";');
}

for (const required of [marker, "CoinbaseConnectionCard", "trader-coinbase-control", "coinbaseConnected"]) {
  if (!connections.includes(required) && !overview.includes(required)) throw new Error(`Coinbase connection final output missing ${required}`);
}

fs.writeFileSync(connectionsPath, connections);
fs.writeFileSync(overviewPath, overview);
console.log("Prepared secure Coinbase Advanced Trade read-only connection and Overview exchange health.");
