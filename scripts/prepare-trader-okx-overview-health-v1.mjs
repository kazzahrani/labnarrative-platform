import fs from "node:fs";
import path from "node:path";

const target = path.join(process.cwd(), "app", "trader", "OverviewCommandCenter.tsx");
if (!fs.existsSync(target)) throw new Error("OKX Overview health target missing");
let source = fs.readFileSync(target, "utf8");
const marker = "OKX_OVERVIEW_HEALTH_V1";

if (!source.includes(marker)) {
  const stateAnchor = '  const [bybitConnected, setBybitConnected] = useState(false);';
  if (!source.includes(stateAnchor)) throw new Error("OKX Overview health could not find Bybit state anchor");
  source = source.replace(stateAnchor, `${stateAnchor}\n  const [okxConnected, setOkxConnected] = useState(false); // ${marker}`);

  const loaderAnchor = `  const loadBybitStatus = useCallback(async () => {\n    try {\n      const { data, error } = await browserSupabase.functions.invoke("trader-bybit-control", { body: { action: "status" } });\n      if (error) throw error;\n      const response = (data ?? {}) as ExchangeStatusResponse;\n      setBybitConnected(response.ok === true && response.connection?.status === "connected");\n    } catch {\n      setBybitConnected(false);\n    }\n  }, []);`;
  if (!source.includes(loaderAnchor)) throw new Error("OKX Overview health could not find Bybit loader anchor");
  const okxLoader = `${loaderAnchor}\n\n  const loadOkxStatus = useCallback(async () => {\n    try {\n      const { data, error } = await browserSupabase.functions.invoke("trader-okx-control", { body: { action: "status" } });\n      if (error) throw error;\n      const response = (data ?? {}) as ExchangeStatusResponse;\n      setOkxConnected(response.ok === true && response.connection?.status === "connected");\n    } catch {\n      setOkxConnected(false);\n    }\n  }, []);`;
  source = source.replace(loaderAnchor, okxLoader);

  const effectAnchor = '  useEffect(() => { void loadBybitStatus(); }, [account.id, loadBybitStatus]);';
  if (!source.includes(effectAnchor)) throw new Error("OKX Overview health could not find exchange-status effect");
  source = source.replace(effectAnchor, '  useEffect(() => { void loadBybitStatus(); void loadOkxStatus(); }, [account.id, loadBybitStatus, loadOkxStatus]);');

  const connectedAnchor = '  const anyConnectedExchange = hasConnectedExchange || bybitConnected;';
  if (!source.includes(connectedAnchor)) throw new Error("OKX Overview health could not find connected-exchange expression");
  source = source.replace(connectedAnchor, '  const anyConnectedExchange = hasConnectedExchange || bybitConnected || okxConnected;');

  const labelAnchor = '  const connectionHealthLabel = hasConnectedExchange && bybitConnected ? "2 exchanges connected" : hasConnectedExchange ? "Binance connected" : bybitConnected ? "Bybit connected · read only" : "Paper ready · no exchange";';
  if (!source.includes(labelAnchor)) throw new Error("OKX Overview health could not find health-label expression");
  source = source.replace(labelAnchor, `  const connectedExchangeCount = Number(hasConnectedExchange) + Number(bybitConnected) + Number(okxConnected);\n  const connectionHealthLabel = connectedExchangeCount > 1 ? \`${'${connectedExchangeCount}'} exchanges connected\` : hasConnectedExchange ? "Binance connected" : bybitConnected ? "Bybit connected · read only" : okxConnected ? "OKX connected · read only" : "Paper ready · no exchange";`);
}

for (const required of [marker, "trader-okx-control", "okxConnected", "connectedExchangeCount"]) {
  if (!source.includes(required)) throw new Error(`OKX Overview health final source missing ${required}`);
}

fs.writeFileSync(target, source);
console.log("Prepared Overview exchange health for Binance, Bybit and OKX.");
