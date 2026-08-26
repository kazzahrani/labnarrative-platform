import fs from "node:fs";
import path from "node:path";

const file = path.join(process.cwd(), "app/trader/TraderV2FullShell.tsx");
let source = fs.readFileSync(file, "utf8");

if (!source.includes("async function invokeLiveTest")) {
  const marker = "\nfunction TraderAuth() {";
  if (!source.includes(marker)) throw new Error("live-test UI: TraderAuth marker missing");
  source = source.replace(marker, `
async function invokeLiveTest(body: Record<string, unknown>) {
  const { data, error } = await browserSupabase.functions.invoke("trader-live-control", { body });
  if (error) {
    let message = error.message || "live_test_failed";
    const context = (error as { context?: Response }).context;
    if (context) {
      try {
        const payload = await context.clone().json() as { error?: string };
        if (payload.error) message = payload.error;
      } catch {}
    }
    throw new Error(message);
  }
  const result = (data ?? {}) as { ok?: boolean; validated?: boolean; freeUsdt?: number; error?: string };
  if (result.error || result.ok !== true) throw new Error(result.error || "live_test_failed");
  return result;
}
${marker}`);
}

if (!source.includes("const [liveTestBusy, setLiveTestBusy]")) {
  const marker = '  const [busy, setBusy] = useState(false);';
  if (!source.includes(marker)) throw new Error("live-test UI: busy state marker missing");
  source = source.replace(marker, `${marker}\n  const [liveTestBusy, setLiveTestBusy] = useState(false);`);
}

if (!source.includes("const validateLiveOrderPath = async")) {
  const marker = '  if (!authReady) return <div className={styles.loadingPage}>Checking secure session…</div>;';
  if (!source.includes(marker)) throw new Error("live-test UI: auth-ready marker missing");
  source = source.replace(marker, `  const validateLiveOrderPath = async () => {
    if (liveTestBusy || currentAccount?.kind !== "real" || !connected) return;
    setLiveTestBusy(true); setError(""); setNotice("");
    try {
      const result = await invokeLiveTest({ action: "validate_test_buy", pair: "BTC/USDT", quoteAmount: 5 });
      setNotice(\`Live Binance order path validated. No order was sent. Free USDT: $\${Number(result.freeUsdt ?? 0).toFixed(2)}.\`);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      if (message.startsWith("insufficient_usdt_for_live_test:")) {
        const free = Number(message.split(":")[1] ?? 0);
        setNotice(\`Order path reached Binance, but only $\${free.toFixed(2)} USDT is free. No order was sent.\`);
      } else setError(message);
    } finally { setLiveTestBusy(false); }
  };

${marker}`);
}

const oldHeading = '<div className={styles.pageHeading}><div><small>{currentAccount.kind === "real" ? "REAL ACCOUNT" : "PAPER ACCOUNT"}</small><h1>Dashboard</h1></div>{currentAccount.kind === "real" && <button className={styles.primaryButton} onClick={() => setExchangeModal(true)}>{connected ? "Exchange connected" : "Connect Exchange"}</button>}</div>';
const newHeading = '<div className={styles.pageHeading}><div><small>{currentAccount.kind === "real" ? "REAL ACCOUNT" : "PAPER ACCOUNT"}</small><h1>Dashboard</h1></div>{currentAccount.kind === "real" && <div style={{display:"flex",gap:8,alignItems:"center"}}>{connected && <button className={styles.ghostButton} disabled={liveTestBusy} onClick={() => void validateLiveOrderPath()}>{liveTestBusy ? "Validating…" : "Validate live path"}</button>}<button className={styles.primaryButton} onClick={() => setExchangeModal(true)}>{connected ? "Exchange connected" : "Connect Exchange"}</button></div>}</div>';
if (source.includes(oldHeading)) source = source.replace(oldHeading, newHeading);
else if (!source.includes("Validate live path")) throw new Error("live-test UI: dashboard heading marker missing");

fs.writeFileSync(file, source);
console.log("Authenticated live order path validation UI prepared");
