import fs from "node:fs";
import path from "node:path";

const connectionsPath = path.join(process.cwd(), "app", "trader", "ConnectionsSettings.tsx");
const overviewPath = path.join(process.cwd(), "app", "trader", "OverviewCommandCenter.tsx");
if (!fs.existsSync(connectionsPath) || !fs.existsSync(overviewPath)) throw new Error("KuCoin connection targets missing");

let connections = fs.readFileSync(connectionsPath, "utf8");
let overview = fs.readFileSync(overviewPath, "utf8");
const marker = "KUCOIN_CONNECTION_V1";

if (!connections.includes(marker)) {
  const importAnchor = 'import KrakenConnectionCard from "./KrakenConnectionCard"; // KRAKEN_CONNECTION_V1';
  if (!connections.includes(importAnchor)) throw new Error("KuCoin connection requires Kraken transform first");
  connections = connections.replace(importAnchor, `${importAnchor}\nimport KuCoinConnectionCard from "./KuCoinConnectionCard"; // ${marker}`);

  const cardAnchor = '        <KrakenConnectionCard realAccountAvailable={Boolean(realAccount)} />';
  if (!connections.includes(cardAnchor)) throw new Error("KuCoin connection could not find Kraken card anchor");
  connections = connections.replace(cardAnchor, `${cardAnchor}\n        <KuCoinConnectionCard realAccountAvailable={Boolean(realAccount)} />`);

  const plannedAnchor = '      <div className={styles.plannedConnections}><span><b>KuCoin</b><small>Planned</small></span></div>\n';
  if (!connections.includes(plannedAnchor)) throw new Error("KuCoin connection could not find final planned-exchange anchor");
  connections = connections.replace(plannedAnchor, "");

  const securityAnchor = 'Binance keeps its fixed-IP execution gateway and existing live-trading safeguards. Bybit, OKX, Coinbase, and Kraken are isolated read-only connections in this phase; write-enabled keys are rejected and LabNarrative does not send orders to these exchanges.';
  if (!connections.includes(securityAnchor)) throw new Error("KuCoin connection could not find security-note anchor");
  connections = connections.replace(securityAnchor, 'Binance keeps its fixed-IP execution gateway and existing live-trading safeguards. Bybit, OKX, Coinbase, Kraken, and KuCoin are isolated read-only connections in this phase; write-enabled keys are rejected and LabNarrative does not send orders to these exchanges.');
}

if (!overview.includes(marker)) {
  const stateAnchor = '  const [krakenConnected, setKrakenConnected] = useState(false); // KRAKEN_CONNECTION_V1';
  if (!overview.includes(stateAnchor)) throw new Error("KuCoin Overview health requires Kraken health transform first");
  overview = overview.replace(stateAnchor, `${stateAnchor}\n  const [kucoinConnected, setKucoinConnected] = useState(false); // ${marker}`);

  const loaderAnchor = `  const loadKrakenStatus = useCallback(async () => {\n    try {\n      const { data, error } = await browserSupabase.functions.invoke("trader-kraken-control", { body: { action: "status" } });\n      if (error) throw error;\n      const response = (data ?? {}) as ExchangeStatusResponse;\n      setKrakenConnected(response.ok === true && response.connection?.status === "connected");\n    } catch {\n      setKrakenConnected(false);\n    }\n  }, []);`;
  if (!overview.includes(loaderAnchor)) throw new Error("KuCoin Overview health could not find Kraken loader anchor");
  const kucoinLoader = `${loaderAnchor}\n\n  const loadKucoinStatus = useCallback(async () => {\n    try {\n      const { data, error } = await browserSupabase.functions.invoke("trader-kucoin-control", { body: { action: "status" } });\n      if (error) throw error;\n      const response = (data ?? {}) as ExchangeStatusResponse;\n      setKucoinConnected(response.ok === true && response.connection?.status === "connected");\n    } catch {\n      setKucoinConnected(false);\n    }\n  }, []);`;
  overview = overview.replace(loaderAnchor, kucoinLoader);

  const effectAnchor = '  useEffect(() => { void loadBybitStatus(); void loadOkxStatus(); void loadCoinbaseStatus(); void loadKrakenStatus(); }, [account.id, loadBybitStatus, loadOkxStatus, loadCoinbaseStatus, loadKrakenStatus]);';
  if (!overview.includes(effectAnchor)) throw new Error("KuCoin Overview health could not find exchange-status effect");
  overview = overview.replace(effectAnchor, '  useEffect(() => { void loadBybitStatus(); void loadOkxStatus(); void loadCoinbaseStatus(); void loadKrakenStatus(); void loadKucoinStatus(); }, [account.id, loadBybitStatus, loadOkxStatus, loadCoinbaseStatus, loadKrakenStatus, loadKucoinStatus]);');

  const connectedAnchor = '  const anyConnectedExchange = hasConnectedExchange || bybitConnected || okxConnected || coinbaseConnected || krakenConnected;';
  if (!overview.includes(connectedAnchor)) throw new Error("KuCoin Overview health could not find connected-exchange expression");
  overview = overview.replace(connectedAnchor, '  const anyConnectedExchange = hasConnectedExchange || bybitConnected || okxConnected || coinbaseConnected || krakenConnected || kucoinConnected;');

  const countAnchor = '  const connectedExchangeCount = Number(hasConnectedExchange) + Number(bybitConnected) + Number(okxConnected) + Number(coinbaseConnected) + Number(krakenConnected);';
  if (!overview.includes(countAnchor)) throw new Error("KuCoin Overview health could not find exchange count expression");
  overview = overview.replace(countAnchor, '  const connectedExchangeCount = Number(hasConnectedExchange) + Number(bybitConnected) + Number(okxConnected) + Number(coinbaseConnected) + Number(krakenConnected) + Number(kucoinConnected);');

  const labelAnchor = '  const connectionHealthLabel = connectedExchangeCount > 1 ? `${connectedExchangeCount} exchanges connected` : hasConnectedExchange ? "Binance connected" : bybitConnected ? "Bybit connected · read only" : okxConnected ? "OKX connected · read only" : coinbaseConnected ? "Coinbase connected · read only" : krakenConnected ? "Kraken connected · read only" : "Paper ready · no exchange";';
  if (!overview.includes(labelAnchor)) throw new Error("KuCoin Overview health could not find health-label expression");
  overview = overview.replace(labelAnchor, '  const connectionHealthLabel = connectedExchangeCount > 1 ? `${connectedExchangeCount} exchanges connected` : hasConnectedExchange ? "Binance connected" : bybitConnected ? "Bybit connected · read only" : okxConnected ? "OKX connected · read only" : coinbaseConnected ? "Coinbase connected · read only" : krakenConnected ? "Kraken connected · read only" : kucoinConnected ? "KuCoin connected · read only" : "Paper ready · no exchange";');
}

for (const required of [marker, "KuCoinConnectionCard", "trader-kucoin-control", "kucoinConnected"]) {
  if (!connections.includes(required) && !overview.includes(required)) throw new Error(`KuCoin connection final output missing ${required}`);
}

fs.writeFileSync(connectionsPath, connections);
fs.writeFileSync(overviewPath, overview);
console.log("Prepared secure KuCoin General-only connection and Overview exchange health.");
