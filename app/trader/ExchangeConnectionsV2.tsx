"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { browserSupabase } from "../../lib/supabase-browser";
import styles from "./exchange-connections-v2.module.css";

type Provider = "bybit" | "okx" | "coinbase" | "kraken" | "kucoin";
type RealAccount = { id: string; name: string; exchangeStatus?: string; apiKeyLast4?: string | null } | null;
type Props = { realAccount: RealAccount; onConnectBinance: () => void; onBackOverview: () => void };
type Connection = { status?: string; apiKeyLast4?: string | null; permissionRead?: boolean; permissionTrade?: boolean; permissionWithdraw?: boolean; ipRestricted?: boolean | null; metadata?: Record<string, unknown> } | null;
type Check = { provider: Provider; connected?: boolean; direct?: boolean; gateway?: boolean; permission?: boolean; withdrawalsDisabled?: boolean; ipRestriction?: boolean | null; ipMatchesGateway?: boolean | null; tradeReady?: boolean; gatewayEgressIp?: string; error?: string | null; directError?: string | null; gatewayError?: string | null; permissionSummary?: string | null };
type StatusResponse = { ok?: boolean; connections?: Array<{ provider: Provider; connection: Connection }>; gateway?: { egressIp?: string; status?: string; lastHealthAt?: string | null }; error?: string };
type DiagnosticsResponse = { ok?: boolean; checks?: Check[]; check?: Check; gateway?: { egressIp?: string; status?: string }; error?: string };

const providers: Array<{ id: Provider; name: string; mark: string; subtitle: string; permission: string; needsPassphrase?: boolean; coinbase?: boolean; ipRequired?: boolean }> = [
  { id: "bybit", name: "Bybit", mark: "B", subtitle: "Unified Spot", permission: "Read + SpotTrade only", ipRequired: true },
  { id: "okx", name: "OKX", mark: "O", subtitle: "Spot trading", permission: "Read + Trade, Withdraw off", needsPassphrase: true, ipRequired: true },
  { id: "coinbase", name: "Coinbase", mark: "C", subtitle: "Advanced Trade", permission: "View + Trade, Transfer off", coinbase: true },
  { id: "kraken", name: "Kraken", mark: "K", subtitle: "Spot trading", permission: "Query Funds + Create/Modify + Cancel/Close", ipRequired: true },
  { id: "kucoin", name: "KuCoin", mark: "K", subtitle: "Classic Spot", permission: "General + Spot only", needsPassphrase: true },
];

function friendlyError(value: unknown) {
  const raw = value instanceof Error ? value.message : String(value || "Connection check failed");
  const map: Array<[string, string]> = [
    ["unsafe_permissions", "Unsafe permissions detected. Keep only the required Spot trading permissions and disable withdrawal/transfer-style permissions."],
    ["withdraw_permission_forbidden", "Withdrawal permission must be disabled."],
    ["transfer_permission_forbidden", "Transfer permission must be disabled."],
    ["spot_trade_permission_required", "Enable Spot trading permission on this API key."],
    ["query_funds_required", "Enable Query Funds permission."],
    ["trade_permissions_must_include", "Enable both create/modify and cancel/close order permissions."],
    ["invalid_credentials", "The exchange rejected these credentials."],
    ["invalid_signature", "The exchange rejected the credential signature. Check the key/secret/passphrase."],
    ["invalid_passphrase", "The exchange rejected the API passphrase."],
    ["kraken_invalid_private_key_format", "Kraken Private Key format was not recognized. Copy the full Private Key exactly as Kraken generated it."],
    ["kraken_api:EAPI:Invalid key", "Kraken rejected the API Key. Copy the current API Key from the same Kraken key pair."],
    ["kraken_api:EAPI:Invalid signature", "Kraken rejected the Private Key/signature. Copy the full Private Key from the same Kraken API key pair."],
    ["kraken_api:EGeneral:Permission denied", "Kraken denied this API key. Confirm Query Funds, Query Open/Closed Orders, Create & Modify Orders, and Cancel & Close Orders are enabled."],
    ["gateway_", "The fixed-IP gateway could not complete this exchange check yet."],
  ];
  return map.find(([key]) => raw.includes(key))?.[1] || raw.replaceAll("_", " ").slice(0, 220);
}

function krakenGatewayIpProof(check?: Check) {
  return check?.permission === true && check.gateway === true && check.direct === false;
}

function effectiveTradeReady(provider: Provider, check?: Check) {
  if (!check) return false;
  if (check.tradeReady === true) return true;
  return provider === "kraken" && krakenGatewayIpProof(check);
}

function effectiveFixedIp(provider: Provider, check?: Check) {
  if (!check) return false;
  if (check.ipMatchesGateway === true) return true;
  return provider === "kraken" && krakenGatewayIpProof(check);
}

function diagnosticLabel(value: unknown) {
  return String(value || "").replaceAll("_", " ").slice(0, 180);
}

async function invoke(action: string, extra: Record<string, unknown> = {}) {
  const { data, error } = await browserSupabase.functions.invoke("trader-multiexchange-control", { body: { action, ...extra } });
  if (error) {
    let message = error.message || "multiexchange_control_failed";
    const context = (error as { context?: Response }).context;
    if (context) {
      try { const payload = await context.clone().json() as { error?: string }; if (payload.error) message = payload.error; } catch {}
    }
    throw new Error(message);
  }
  const result = (data ?? {}) as StatusResponse & DiagnosticsResponse & { connection?: Connection };
  if (result.error || result.ok !== true) throw new Error(result.error || "multiexchange_control_failed");
  return result;
}

async function invokeKraken(action: string, extra: Record<string, unknown> = {}) {
  const { data, error } = await browserSupabase.functions.invoke("trader-kraken-trade-control", { body: { action, ...extra } });
  if (error) {
    let message = error.message || "kraken_control_failed";
    const context = (error as { context?: Response }).context;
    if (context) {
      try { const payload = await context.clone().json() as { error?: string }; if (payload.error) message = payload.error; } catch {}
    }
    throw new Error(message);
  }
  const result = (data ?? {}) as StatusResponse & DiagnosticsResponse & { connection?: Connection; check?: Check };
  if (result.error || result.ok !== true) throw new Error(result.error || "kraken_control_failed");
  return result;
}

export default function ExchangeConnectionsV2({ realAccount, onConnectBinance, onBackOverview }: Props) {
  const [connections, setConnections] = useState<Record<Provider, Connection>>({ bybit: null, okx: null, coinbase: null, kraken: null, kucoin: null });
  const [checks, setChecks] = useState<Partial<Record<Provider, Check>>>({});
  const [gatewayIp, setGatewayIp] = useState("");
  const [modal, setModal] = useState<Provider | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [checkingAll, setCheckingAll] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [binanceCheck, setBinanceCheck] = useState<"idle" | "checking" | "ready" | "error">("idle");
  const binanceConnected = realAccount?.exchangeStatus === "connected";

  const load = useCallback(async () => {
    if (!realAccount) return;
    try {
      const result = await invoke("status_all");
      const next = { bybit: null, okx: null, coinbase: null, kraken: null, kucoin: null } as Record<Provider, Connection>;
      for (const item of result.connections ?? []) next[item.provider] = item.connection;
      setConnections(next);
      setGatewayIp((current) => result.gateway?.egressIp || current);
    } catch (caught) { setErrorMessage(friendlyError(caught)); }
  }, [realAccount]);

  useEffect(() => { void load(); }, [load]);

  const coinbaseDeferred = connections.coinbase?.status !== "connected";
  const readinessProviders = useMemo(() => providers.filter((p) => !coinbaseDeferred || p.id !== "coinbase"), [coinbaseDeferred]);
  const readinessTarget = readinessProviders.length + 1;
  const connectedCount = useMemo(() => providers.filter((p) => connections[p.id]?.status === "connected").length + Number(binanceConnected), [connections, binanceConnected]);
  const readyCount = useMemo(() => readinessProviders.filter((p) => effectiveTradeReady(p.id, checks[p.id])).length + Number(binanceCheck === "ready"), [readinessProviders, checks, binanceCheck]);

  const open = (provider: Provider) => {
    setModal(provider); setApiKey(""); setApiSecret(""); setPassphrase(""); setErrorMessage("");
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!modal || busy) return;
    setBusy(true); setErrorMessage("");
    try {
      const item = providers.find((p) => p.id === modal)!;
      const payload = item.coinbase
        ? { provider: modal, keyName: apiKey.trim(), keySecret: apiSecret.trim() }
        : { provider: modal, apiKey: apiKey.trim(), apiSecret: apiSecret.trim(), ...(item.needsPassphrase ? { passphrase: passphrase.trim() } : {}) };
      const result = modal === "kraken" ? await invokeKraken("upgrade", payload) : await invoke("upgrade", payload);
      setConnections((current) => ({ ...current, [modal]: result.connection ?? null }));
      const diag = await invoke("diagnostics", { provider: modal }) as DiagnosticsResponse;
      if (diag.check) {
        setChecks((current) => ({ ...current, [modal]: diag.check }));
        if (diag.check.gatewayEgressIp) setGatewayIp(diag.check.gatewayEgressIp);
      }
      setApiKey(""); setApiSecret(""); setPassphrase("");
    } catch (caught) { setErrorMessage(friendlyError(caught)); }
    finally { setBusy(false); }
  };

  const runAll = async () => {
    if (checkingAll) return;
    setCheckingAll(true); setErrorMessage(""); setBinanceCheck(binanceConnected ? "checking" : "idle");
    try {
      const activeProviders = providers.filter((p) => connections[p.id]?.status === "connected");
      const exchangeJobs = activeProviders.map(async (item) => {
        const result = await invoke("diagnostics", { provider: item.id }) as DiagnosticsResponse;
        if (result.check) {
          setChecks((current) => ({ ...current, [item.id]: result.check }));
          if (result.check.gatewayEgressIp) setGatewayIp(result.check.gatewayEgressIp);
        }
        return result.check;
      });
      const binanceJob = async () => {
        if (!binanceConnected) return;
        const result = await browserSupabase.functions.invoke("trader-binance-control", { body: { action: "gateway_health" } });
        if (!result.error && (result.data as { ok?: boolean } | null)?.ok === true) setBinanceCheck("ready");
        else setBinanceCheck("error");
      };
      const results = await Promise.allSettled([...exchangeJobs, binanceJob()]);
      const failed = results.find((result) => result.status === "rejected") as PromiseRejectedResult | undefined;
      if (failed) setErrorMessage(friendlyError(failed.reason));
    } finally { setCheckingAll(false); }
  };

  const disconnect = async (provider: Provider) => {
    if (busy || !window.confirm(`Disconnect ${providers.find((p) => p.id === provider)?.name}? This does not alter existing trades.`)) return;
    setBusy(true); setErrorMessage("");
    try { await invoke("disconnect", { provider }); setChecks((x) => ({ ...x, [provider]: undefined })); setModal(null); await load(); }
    catch (caught) { setErrorMessage(friendlyError(caught)); }
    finally { setBusy(false); }
  };

  return <div className={styles.page}>
    <div className={styles.heading}>
      <div><small>SETTINGS</small><h1>Connections</h1><p>Connect exchange accounts once, verify their safety permissions, and test the fixed-IP execution path before live routing is enabled.</p></div>
      <button type="button" className={styles.ghost} onClick={onBackOverview}>← Overview</button>
    </div>

    <section className={styles.readiness}>
      <div><span className={styles.kicker}>TRADING READINESS</span><strong>{readyCount} / {readinessTarget} ready</strong><small>{connectedCount} connected · {coinbaseDeferred ? "Coinbase deferred · " : ""}no test orders are placed</small></div>
      <div className={styles.gateway}><span>Fixed execution IP</span><b>{gatewayIp || "Loading…"}</b><small>Whitelist this IP on trade-enabled keys where supported.</small></div>
      <button type="button" className={styles.runButton} disabled={checkingAll || !realAccount} onClick={() => void runAll()}>{checkingAll ? "Running checks…" : `Run ${readinessTarget} active checks`}</button>
    </section>

    {errorMessage && <div className={styles.error}>{errorMessage}</div>}

    <section>
      <div className={styles.sectionHead}><div><small>EXCHANGES</small><h2>Exchange connections</h2></div><p>Trading keys are accepted only for Spot execution. Withdrawal capability is never required.</p></div>
      <div className={styles.grid}>
        <article className={styles.card}>
          <div className={styles.brand}><span>◆</span><div><b>Binance</b><small>Spot · live execution</small></div></div>
          <div className={styles.statusRow}><span className={binanceConnected ? styles.good : styles.off}><i/>{binanceConnected ? "Connected" : "Not connected"}</span><small>{binanceCheck === "ready" ? "Gateway ✓" : binanceCheck === "error" ? "Gateway check failed" : "Existing protected route"}</small></div>
          <div className={styles.chips}><span>Balances</span><span>Spot trading</span><span>No withdrawals</span></div>
          <button type="button" className={binanceConnected ? styles.secondary : styles.primary} onClick={onConnectBinance}>{binanceConnected ? "Manage Binance" : "Connect Binance"}</button>
        </article>

        {providers.map((item) => {
          const connection = connections[item.id], check = checks[item.id], connected = connection?.status === "connected", trade = connection?.permissionTrade === true;
          const effectiveReady = effectiveTradeReady(item.id, check), fixedIpReady = effectiveFixedIp(item.id, check);
          const state = effectiveReady ? "Trade ready" : connected && trade ? "Needs gateway check" : connected ? "Read only" : item.id === "coinbase" && coinbaseDeferred ? "Deferred" : "Not connected";
          return <article className={styles.card} key={item.id}>
            <div className={styles.brand}><span>{item.mark}</span><div><b>{item.name}</b><small>{item.subtitle}</small></div></div>
            <div className={styles.statusRow}><span className={effectiveReady ? styles.good : connected ? styles.warn : styles.off}><i/>{state}</span><small>{connected && connection?.apiKeyLast4 ? `Key ••••${connection.apiKeyLast4}` : item.id === "coinbase" && coinbaseDeferred ? "Verification pending" : "Real Account"}</small></div>
            <div className={styles.chips}><span>Balances</span><span>{trade ? "Spot trading" : "Read only"}</span><span>No withdrawals</span></div>
            {check && <div className={styles.checks}>
              <span className={check.permission ? styles.pass : styles.fail}>Trade permission {check.permission ? "✓" : "—"}</span>
              <span className={check.gateway ? styles.pass : styles.fail}>Gateway {check.gateway ? "✓" : "×"}</span>
              {item.ipRequired && <span className={fixedIpReady ? styles.pass : styles.fail}>Fixed IP {fixedIpReady ? "✓" : "×"}</span>}
              {!check.gateway && check.gatewayError && <small title={check.gatewayError}>Gateway error: {diagnosticLabel(check.gatewayError)}</small>}
            </div>}
            <button type="button" className={connected ? styles.secondary : styles.primary} onClick={() => open(item.id)}>{connected ? (trade ? "Manage / re-key" : "Enable Spot trading") : `Connect ${item.name}`}</button>
          </article>;
        })}
      </div>
    </section>

    <section className={styles.security}>
      <span>✓</span><div><b>Launch security rule</b><p>LabNarrative accepts the minimum permissions needed for Spot trading and never asks for withdrawal permission. The readiness test authenticates, inspects permissions, and checks the fixed-IP gateway without creating, cancelling, or filling an order.</p></div>
    </section>

    {modal && (() => {
      const item = providers.find((p) => p.id === modal)!;
      const connection = connections[modal];
      const check = checks[modal];
      return <div className={styles.backdrop} onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setModal(null); }}>
        <section className={styles.modal}>
          <div className={styles.modalHead}><div><small>{item.name.toUpperCase()} · SPOT</small><h2>{connection?.status === "connected" ? `Manage ${item.name}` : `Connect ${item.name}`}</h2></div><button type="button" disabled={busy} onClick={() => setModal(null)}>×</button></div>
          <div className={styles.permissionBox}><b>Required permissions</b><span>{item.permission}</span>{item.ipRequired && <small>For Trade Ready status, whitelist fixed IP: <strong>{gatewayIp || "shown on Connections"}</strong></small>}</div>
          {check && <div className={styles.modalChecks}><span>Gateway <b>{check.gateway ? "Passed" : "Not passed"}</b></span><span>Trade permission <b>{check.permission ? "Enabled" : "Not enabled"}</b></span><span>Trading ready <b>{effectiveTradeReady(item.id, check) ? "Yes" : "No"}</b></span></div>}
          <form onSubmit={save} className={styles.form}>
            <label><span>{item.coinbase ? "API Key Name" : "API Key"}</span><input type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} disabled={busy} /></label>
            <label><span>{item.coinbase ? "EC Private Key" : item.id === "kraken" ? "Private Key" : "API Secret"}</span>{item.coinbase ? <textarea autoComplete="new-password" value={apiSecret} onChange={(e) => setApiSecret(e.target.value)} disabled={busy} rows={5}/> : <input type="password" autoComplete="new-password" value={apiSecret} onChange={(e) => setApiSecret(e.target.value)} disabled={busy}/>}</label>
            {item.needsPassphrase && <label><span>API Passphrase</span><input type="password" autoComplete="new-password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} disabled={busy}/></label>}
            <p>Credentials are verified server-side and stored through the existing encrypted exchange credential vault. Do not paste them into chat.</p>
            <div className={styles.modalActions}>{connection?.status === "connected" && <button type="button" className={styles.danger} disabled={busy} onClick={() => void disconnect(modal)}>Disconnect</button>}<button type="button" className={styles.secondary} disabled={busy} onClick={() => setModal(null)}>Cancel</button><button type="submit" className={styles.primary} disabled={busy}>{busy ? "Verifying…" : connection?.status === "connected" ? "Verify & replace key" : "Connect & verify"}</button></div>
          </form>
        </section>
      </div>;
    })()}
  </div>;
}