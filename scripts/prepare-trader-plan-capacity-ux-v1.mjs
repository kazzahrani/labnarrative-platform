import fs from "node:fs";

const file = "app/trader/ExchangeConnectionsV2.tsx";
let source = fs.readFileSync(file, "utf8");
const marker = "PLAN_CAPACITY_UX_V1";

if (source.includes(marker)) {
  console.log("Trader plan capacity UX already prepared.");
  process.exit(0);
}

function replaceOnce(before, after, label) {
  if (!source.includes(before)) throw new Error(`Trader plan capacity UX could not find ${label}.`);
  source = source.replace(before, after);
}

replaceOnce(
  'type DiagnosticsResponse = { ok?: boolean; checks?: Check[]; check?: Check; gateway?: { egressIp?: string; status?: string }; error?: string };',
  `type DiagnosticsResponse = { ok?: boolean; checks?: Check[]; check?: Check; gateway?: { egressIp?: string; status?: string }; error?: string };\ntype EntitlementSnapshot = {\n  ok?: boolean;\n  enforcementActive: boolean;\n  plan: string;\n  limits: { activeExchanges: number | null };\n  usage: { activeExchanges: number };\n  remaining: { activeExchanges: number | null };\n};\n// ${marker}`,
  "entitlement response type",
);

replaceOnce(
  '  const map: Array<[string, string]> = [\n    ["unsafe_permissions",',
  '  const map: Array<[string, string]> = [\n    ["_plan_exchange_limit_reached", "Your plan\'s exchange connection limit has been reached. Disconnect another exchange or upgrade your plan."],\n    ["unsafe_permissions",',
  "friendly plan-limit error",
);

replaceOnce(
  '  const [errorMessage, setErrorMessage] = useState("");\n  const [binanceCheck, setBinanceCheck] = useState<"idle" | "checking" | "ready" | "error">("idle");',
  '  const [errorMessage, setErrorMessage] = useState("");\n  const [entitlements, setEntitlements] = useState<EntitlementSnapshot | null>(null);\n  const [binanceCheck, setBinanceCheck] = useState<"idle" | "checking" | "ready" | "error">("idle");',
  "entitlement state",
);

replaceOnce(
  '  useEffect(() => { void load(); }, [load]);\n\n  const coinbaseDeferred',
  `  const loadEntitlements = useCallback(async () => {\n    try {\n      const { data, error } = await browserSupabase.functions.invoke("trader-entitlements-control", { body: {} });\n      if (error || !data) return;\n      const snapshot = data as EntitlementSnapshot;\n      if (snapshot.ok === true) setEntitlements(snapshot);\n    } catch {}\n  }, []);\n\n  useEffect(() => { void load(); }, [load]);\n  useEffect(() => { void loadEntitlements(); }, [loadEntitlements, binanceConnected]);\n\n  const coinbaseDeferred`,
  "connection load effect",
);

replaceOnce(
  '  const readyCount = useMemo(() => readinessProviders.filter((p) => effectiveTradeReady(p.id, checks[p.id])).length + Number(binanceCheck === "ready"), [readinessProviders, checks, binanceCheck]);\n\n  const open = (provider: Provider) => {\n    setModal(provider); setApiKey(""); setApiSecret(""); setPassphrase(""); setErrorMessage("");\n  };',
  `  const readyCount = useMemo(() => readinessProviders.filter((p) => effectiveTradeReady(p.id, checks[p.id])).length + Number(binanceCheck === "ready"), [readinessProviders, checks, binanceCheck]);\n  const exchangeBlockedReason = useMemo(() => {\n    if (!entitlements?.enforcementActive) return "";\n    const max = entitlements.limits?.activeExchanges;\n    if (max == null) return "";\n    const remaining = Number(entitlements.remaining?.activeExchanges ?? Math.max(0, max - Number(entitlements.usage?.activeExchanges ?? 0)));\n    if (remaining > 0) return "";\n    if (max <= 0) return "Exchange connections are not included in your current plan. Upgrade to Starter or higher.";\n    const plan = String(entitlements.plan || "current");\n    const planLabel = plan.charAt(0).toUpperCase() + plan.slice(1);\n    return \`Your \${planLabel} plan's \${max} exchange connection slot\${max === 1 ? " is" : "s are"} already in use. Disconnect an exchange or upgrade your plan.\`;\n  }, [entitlements]);\n  const exchangeAllowanceLabel = useMemo(() => {\n    if (!entitlements?.enforcementActive) return "";\n    const plan = String(entitlements.plan || "current");\n    const planLabel = plan.charAt(0).toUpperCase() + plan.slice(1);\n    const max = entitlements.limits?.activeExchanges;\n    const used = Number(entitlements.usage?.activeExchanges ?? connectedCount);\n    return max == null ? \`\${planLabel}: unlimited exchange connections\` : \`\${planLabel}: \${used} / \${max} exchange slot\${max === 1 ? "" : "s"} used\`;\n  }, [entitlements, connectedCount]);\n  const providerHasSlot = (provider: Provider) => ["pending", "connected"].includes(String(connections[provider]?.status || "").toLowerCase());\n  const binanceHasSlot = ["pending", "connected"].includes(String(realAccount?.exchangeStatus || "").toLowerCase());\n\n  const open = (provider: Provider) => {\n    if (!providerHasSlot(provider) && exchangeBlockedReason) { setErrorMessage(exchangeBlockedReason); return; }\n    setModal(provider); setApiKey(""); setApiSecret(""); setPassphrase(""); setErrorMessage("");\n  };\n\n  const openBinance = () => {\n    if (!binanceHasSlot && exchangeBlockedReason) { setErrorMessage(exchangeBlockedReason); return; }\n    setErrorMessage("");\n    onConnectBinance();\n  };`,
  "capacity derivation and open guards",
);

replaceOnce(
  '    if (!modal || busy) return;\n    setBusy(true); setErrorMessage("");',
  '    if (!modal || busy) return;\n    if (!providerHasSlot(modal) && exchangeBlockedReason) { setErrorMessage(exchangeBlockedReason); return; }\n    setBusy(true); setErrorMessage("");',
  "modal save guard",
);

replaceOnce(
  '      setApiKey(""); setApiSecret(""); setPassphrase("");\n    } catch (caught) { setErrorMessage(friendlyError(caught)); }',
  '      setApiKey(""); setApiSecret(""); setPassphrase("");\n      await loadEntitlements();\n    } catch (caught) { setErrorMessage(friendlyError(caught)); }',
  "post-connect entitlement refresh",
);

replaceOnce(
  '    try { await invoke("disconnect", { provider }); setChecks((x) => ({ ...x, [provider]: undefined })); setModal(null); await load(); }',
  '    try { await invoke("disconnect", { provider }); setChecks((x) => ({ ...x, [provider]: undefined })); setModal(null); await load(); await loadEntitlements(); }',
  "post-disconnect entitlement refresh",
);

replaceOnce(
  '<small>{connectedCount} connected · {coinbaseDeferred ? "Coinbase deferred · " : ""}no test orders are placed</small>',
  '<small>{connectedCount} connected · {coinbaseDeferred ? "Coinbase deferred · " : ""}no test orders are placed{exchangeAllowanceLabel ? ` · ${exchangeAllowanceLabel}` : ""}</small>',
  "readiness allowance label",
);

replaceOnce(
  '<button type="button" className={binanceConnected ? styles.secondary : styles.primary} onClick={onConnectBinance}>{binanceConnected ? "Manage Binance" : "Connect Binance"}</button>',
  '<button type="button" className={binanceConnected ? styles.secondary : styles.primary} title={!binanceHasSlot && exchangeBlockedReason ? exchangeBlockedReason : undefined} onClick={openBinance}>{binanceConnected ? "Manage Binance" : !binanceHasSlot && exchangeBlockedReason ? "Plan limit reached" : "Connect Binance"}</button>',
  "Binance connect control",
);

replaceOnce(
  '          const effectiveReady = effectiveTradeReady(item.id, check), fixedIpReady = effectiveFixedIp(item.id, check);\n          const state = effectiveReady ? "Trade ready"',
  '          const effectiveReady = effectiveTradeReady(item.id, check), fixedIpReady = effectiveFixedIp(item.id, check);\n          const slotActive = ["pending", "connected"].includes(String(connection?.status || "").toLowerCase()), planBlocked = !slotActive && Boolean(exchangeBlockedReason);\n          const state = effectiveReady ? "Trade ready"',
  "provider slot state",
);

replaceOnce(
  '<button type="button" className={connected ? styles.secondary : styles.primary} onClick={() => open(item.id)}>{connected ? (trade ? "Manage / re-key" : "Enable Spot trading") : `Connect ${item.name}`}</button>',
  '<button type="button" className={connected ? styles.secondary : styles.primary} title={planBlocked ? exchangeBlockedReason : undefined} onClick={() => open(item.id)}>{connected ? (trade ? "Manage / re-key" : "Enable Spot trading") : planBlocked ? "Plan limit reached" : `Connect ${item.name}`}</button>',
  "provider connect control",
);

fs.writeFileSync(file, source);
console.log("Prepared plan-aware Trader exchange connection capacity UX.");
