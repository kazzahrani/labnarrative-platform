import fs from "node:fs";
import path from "node:path";

const connectionsPath = path.join(process.cwd(), "app", "trader", "ConnectionsSettings.tsx");
const overviewPath = path.join(process.cwd(), "app", "trader", "OverviewCommandCenter.tsx");
if (!fs.existsSync(connectionsPath) || !fs.existsSync(overviewPath)) throw new Error("Kraken connection targets missing");

let connections = fs.readFileSync(connectionsPath, "utf8");
let overview = fs.readFileSync(overviewPath, "utf8");
const marker = "KRAKEN_CONNECTION_V1";

if (!connections.includes(marker)) {
  const importAnchor = 'import CoinbaseConnectionCard from "./CoinbaseConnectionCard"; // COINBASE_CONNECTION_V1';
  if (!connections.includes(importAnchor)) throw new Error("Kraken connection requires Coinbase transform first");
  connections = connections.replace(importAnchor, `${importAnchor}\nimport KrakenConnectionCard from "./KrakenConnectionCard"; // ${marker}`);

  const cardAnchor = '        <CoinbaseConnectionCard realAccountAvailable={Boolean(realAccount)} />';
  if (!connections.includes(cardAnchor)) throw new Error("Kraken connection could not find Coinbase card anchor");
  connections = connections.replace(cardAnchor, `${cardAnchor}\n        <KrakenConnectionCard realAccountAvailable={Boolean(realAccount)} />`);

  const plannedAnchor = '<div className={styles.plannedConnections}><span><b>Kraken</b><small>Planned</small></span><span><b>KuCoin</b><small>Planned</small></span></div>';
  if (!connections.includes(plannedAnchor)) throw new Error("Kraken connection could not find planned-exchanges anchor");
  connections = connections.replace(plannedAnchor, '<div className={styles.plannedConnections}><span><b>KuCoin</b><small>Planned</small></span></div>');

  const securityAnchor = 'Binance keeps its fixed-IP execution gateway and existing live-trading safeguards. Bybit, OKX, and Coinbase are isolated read-only connections in this phase; write/transfer-enabled keys are rejected and LabNarrative does not send orders to these exchanges.';
  if (!connections.includes(securityAnchor)) throw new Error("Kraken connection could not find security-note anchor");
  connections = connections.replace(securityAnchor, 'Binance keeps its fixed-IP execution gateway and existing live-trading safeguards. Bybit, OKX, Coinbase, and Kraken are isolated read-only connections in this phase; write-enabled keys are rejected and LabNarrative does not send orders to these exchanges.');
}

if (!overview.includes(marker)) {
  const stateAnchor = '  const [coinbaseConnected, setCoinbaseConnected] = useState(false); // COINBASE_CONNECTION_V1';
  if (!overview.includes(stateAnchor)) throw new Error("Kraken Overview health requires Coinbase health transform first");
  overview = overview.replace(stateAnchor, `${stateAnchor}\n  const [krakenConnected, setKrakenConnected] = useState(false); // ${marker}`);

  const loaderAnchor = `  const loadCoinbaseStatus = useCallback(async () => {\n    try {\n      const { data, error } = await browserSupabase.functions.invoke("trader-coinbase-control", { body: { action: "status" } });\n      if (error) throw error;\n      const response = (data ?? {}) as ExchangeStatusResponse;\n      setCoinbaseConnected(response.ok === true && response.connection?.status === "connected");\n    } catch {\n      setCoinbaseConnected(false);\n    }\n  }, []);`;
  if (!overview.includes(loaderAnchor)) throw new Error("Kraken Overview health could not find Coinbase loader anchor");
  const krakenLoader = `${loaderAnchor}\n\n  const loadKrakenStatus = useCallback(async () => {\n    try {\n      const { data, error } = await browserSupabase.functions.invoke("trader-kraken-control", { body: { action: "status" } });\n      if (error) throw error;\n      const response = (data ?? {}) as ExchangeStatusResponse;\n      setKrakenConnected(response.ok === true && response.connection?.status === "connected");\n    } catch {\n      setKrakenConnected(false);\n    }\n  }, []);`;
  overview = overview.replace(loaderAnchor, krakenLoader);

  const effectAnchor = '  useEffect(() => { void loadBybitStatus(); void loadOkxStatus(); void loadCoinbaseStatus(); }, [account.id, loadBybitStatus, loadOkxStatus, loadCoinbaseStatus]);';
  if (!overview.includes(effectAnchor)) throw new Error("Kraken Overview health could not find exchange-status effect");
  overview = overview.replace(effectAnchor, '  useEffect(() => { void loadBybitStatus(); void loadOkxStatus(); void loadCoinbaseStatus(); void loadKrakenStatus(); }, [account.id, loadBybitStatus, loadOkxStatus, loadCoinbaseStatus, loadKrakenStatus]);');

  const connectedAnchor = '  const anyConnectedExchange = hasConnectedExchange || bybitConnected || okxConnected || coinbaseConnected;';
  if (!overview.includes(connectedAnchor)) throw new Error("Kraken Overview health could not find connected-exchange expression");
  overview = overview.replace(connectedAnchor, '  const anyConnectedExchange = hasConnectedExchange || bybitConnected || okxConnected || coinbaseConnected || krakenConnected;');

  const countAnchor = '  const connectedExchangeCount = Number(hasConnectedExchange) + Number(bybitConnected) + Number(okxConnected) + Number(coinbaseConnected);';
  if (!overview.includes(countAnchor)) throw new Error("Kraken Overview health could not find exchange count expression");
  overview = overview.replace(countAnchor, '  const connectedExchangeCount = Number(hasConnectedExchange) + Number(bybitConnected) + Number(okxConnected) + Number(coinbaseConnected) + Number(krakenConnected);');

  const labelAnchor = '  const connectionHealthLabel = connectedExchangeCount > 1 ? `${connectedExchangeCount} exchanges connected` : hasConnectedExchange ? "Binance connected" : bybitConnected ? "Bybit connected · read only" : okxConnected ? "OKX connected · read only" : coinbaseConnected ? "Coinbase connected · read only" : "Paper ready · no exchange";';
  if (!overview.includes(labelAnchor)) throw new Error("Kraken Overview health could not find health-label expression");
  overview = overview.replace(labelAnchor, '  const connectionHealthLabel = connectedExchangeCount > 1 ? `${connectedExchangeCount} exchanges connected` : hasConnectedExchange ? "Binance connected" : bybitConnected ? "Bybit connected · read only" : okxConnected ? "OKX connected · read only" : coinbaseConnected ? "Coinbase connected · read only" : krakenConnected ? "Kraken connected · read only" : "Paper ready · no exchange";');
}

for (const required of [marker, "KrakenConnectionCard", "trader-kraken-control", "krakenConnected"]) {
  if (!connections.includes(required) && !overview.includes(required)) throw new Error(`Kraken connection final output missing ${required}`);
}

fs.writeFileSync(connectionsPath, connections);
fs.writeFileSync(overviewPath, overview);
console.log("Prepared secure Kraken Spot read-only connection and Overview exchange health.");
