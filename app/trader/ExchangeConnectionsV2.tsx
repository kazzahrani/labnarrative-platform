"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { browserSupabase } from "../../lib/supabase-browser";
import ExchangeLogo, { ExchangeProvider } from "./ExchangeLogo";
import styles from "./exchange-connections-v2.module.css";

type Provider = Exclude<ExchangeProvider, "binance">;
type RealAccount = { id: string; name: string; exchangeStatus?: string; apiKeyLast4?: string | null } | null;
type Props = { realAccount: RealAccount; onConnectBinance: () => void; onBackOverview: () => void };
type Connection = { status?: string; apiKeyLast4?: string | null; permissionRead?: boolean; permissionTrade?: boolean; permissionWithdraw?: boolean; capabilities?: Record<string, unknown>; metadata?: Record<string, unknown> } | null;
type Check = { provider: Provider; connected?: boolean; permission?: boolean; withdrawalsDisabled?: boolean; tradeReady?: boolean; error?: string | null; gatewayError?: string | null };
type StatusResponse = { ok?: boolean; connections?: Array<{ provider: Provider; connection: Connection }>; error?: string };
type DiagnosticsResponse = { ok?: boolean; checks?: Check[]; check?: Check; error?: string };

type ProviderConfig = { id: Provider; name: string; subtitle: string; permission: string; needsPassphrase?: boolean; coinbase?: boolean };
const providers: ProviderConfig[] = [
  { id: "bybit", name: "Bybit", subtitle: "Unified Spot", permission: "Read + Spot Trade only" },
  { id: "okx", name: "OKX", subtitle: "Spot", permission: "Read + Trade · Withdraw off", needsPassphrase: true },
  { id: "kraken", name: "Kraken", subtitle: "Spot", permission: "Query funds + trade + cancel" },
  { id: "kucoin", name: "KuCoin", subtitle: "Spot", permission: "General + Spot only", needsPassphrase: true },
  { id: "coinbase", name: "Coinbase", subtitle: "Advanced Trade", permission: "View + Trade · Transfer off", coinbase: true },
];

function friendlyError(value: unknown) {
  const raw = value instanceof Error ? value.message : String(value || "connection_failed");
  if (raw.includes("invalid_credentials_format")) return "Check the API credentials and try again.";
  if (raw.includes("unsafe_permissions") || raw.includes("withdraw_permission") || raw.includes("transfer_permission")) return "Remove withdrawal, transfer, futures, margin, derivatives, or other unnecessary permissions. Keep only Spot trading and read access.";
  if (raw.includes("trade_permission") || raw.includes("spot_trade_permission") || raw.includes("trade_permissions")) return "Enable the required Spot trading permissions on this API key.";
  if (raw.includes("query_funds")) return "Enable Query Funds on this Kraken API key.";
  if (raw.includes("general_permission")) return "Enable General permission on this KuCoin API key.";
  if (raw.includes("view_permission")) return "Enable View permission on this Coinbase API key.";
  if (raw.includes("http_401") || raw.includes("http_403") || raw.includes("signature") || raw.includes("invalid")) return "The exchange rejected these credentials. Check the key, secret, passphrase and API permissions.";
  return "The exchange could not verify this connection. No trading changes were made.";
}

async function invoke(body: Record<string, unknown>) {
  const { data, error } = await browserSupabase.functions.invoke("trader-multiexchange-control", { body });
  if (error) {
    let message = error.message || "multiexchange_control_failed";
    const context = (error as { context?: Response }).context;
    if (context) try { const payload = await context.clone().json() as { error?: string }; if (payload.error) message = payload.error; } catch {}
    throw new Error(message);
  }
  const result = (data ?? {}) as StatusResponse & DiagnosticsResponse & { connection?: Connection };
  if (result.error || result.ok !== true) throw new Error(result.error || "multiexchange_control_failed");
  return result;
}

export default function ExchangeConnectionsV2({ realAccount, onConnectBinance, onBackOverview }: Props) {
  const [connections, setConnections] = useState<Record<Provider, Connection>>({ bybit: null, okx: null, kraken: null, kucoin: null, coinbase: null });
  const [checks, setChecks] = useState<Partial<Record<Provider, Check>>>({});
  const [selected, setSelected] = useState<ProviderConfig | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [keyName, setKeyName] = useState("");
  const [keySecret, setKeySecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const result = await invoke({ action: "status_all" });
      const next = { bybit: null, okx: null, kraken: null, kucoin: null, coinbase: null } as Record<Provider, Connection>;
      for (const item of result.connections ?? []) next[item.provider] = item.connection;
      setConnections(next);
      setError("");
      const connectedProviders = providers.filter(p => next[p.id]?.status === "connected" && next[p.id]?.permissionTrade === true);
      if (connectedProviders.length) {
        void Promise.all(connectedProviders.map(async p => {
          try { const d = await invoke({ action: "diagnostics", provider: p.id }); if (d.check) setChecks(v => ({ ...v, [p.id]: d.check })); } catch {}
        }));
      }
    } catch (caught) { setError(friendlyError(caught)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const connectedCount = useMemo(() => Number(realAccount?.exchangeStatus === "connected") + providers.filter(p => connections[p.id]?.status === "connected").length, [connections, realAccount?.exchangeStatus]);
  const readyCount = useMemo(() => Number(realAccount?.exchangeStatus === "connected") + providers.filter(p => checks[p.id]?.tradeReady === true).length, [checks, realAccount?.exchangeStatus]);

  const resetModal = () => { setApiKey(""); setApiSecret(""); setPassphrase(""); setKeyName(""); setKeySecret(""); setError(""); };
  const open = (provider: ProviderConfig) => { resetModal(); setSelected(provider); };
  const close = () => { if (!busy) { setSelected(null); resetModal(); } };

  const connect = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected || busy) return;
    setBusy(true); setError("");
    try {
      const payload = selected.coinbase
        ? { action: "connect", provider: selected.id, keyName: keyName.trim(), keySecret: keySecret.trim() }
        : { action: "connect", provider: selected.id, apiKey: apiKey.trim(), apiSecret: apiSecret.trim(), ...(selected.needsPassphrase ? { passphrase: passphrase.trim() } : {}) };
      const result = await invoke(payload);
      setConnections(v => ({ ...v, [selected.id]: result.connection ?? v[selected.id] }));
      try {
        const d = await invoke({ action: "diagnostics", provider: selected.id });
        if (d.check) setChecks(v => ({ ...v, [selected.id]: d.check }));
      } catch {}
      setSelected(null); resetModal();
      await load();
    } catch (caught) { setError(friendlyError(caught)); }
    finally { setBusy(false); }
  };

  const disconnect = async (provider: Provider) => {
    if (busy || !window.confirm(`Disconnect ${providers.find(p => p.id === provider)?.name || provider}? Existing bot and trade history will be preserved.`)) return;
    setBusy(true); setError("");
    try {
      const result = await invoke({ action: "disconnect", provider });
      setConnections(v => ({ ...v, [provider]: result.connection ?? null }));
      setChecks(v => ({ ...v, [provider]: undefined }));
      setSelected(null);
    } catch (caught) { setError(friendlyError(caught)); }
    finally { setBusy(false); }
  };

  return <div className={styles.page}>
    <div className={styles.heading}><div><small>SETTINGS · CONNECTIONS</small><h1>Exchanges</h1><p>Connect an exchange once. It then becomes available to Automations, Portfolio, Positions and the rest of your trading workspace.</p></div><button className={styles.ghost} onClick={onBackOverview}>Back to Overview</button></div>
    <div className={styles.simpleSummary}><div><strong>{connectedCount}</strong><span>connected</span></div><div><strong>{readyCount}</strong><span>ready for live execution</span></div><p>API credentials are encrypted server-side. Withdrawal and transfer permissions are rejected.</p></div>
    {error && <div className={styles.error}>{error}</div>}
    <section><div className={styles.sectionHead}><div><small>EXCHANGES</small><h2>Choose where each automation trades</h2></div></div>
      <div className={styles.grid}>
        <article className={styles.card}>
          <div className={styles.brand}><ExchangeLogo provider="binance"/><div><b>Binance</b><small>Spot</small></div></div>
          <div className={styles.statusRow}><span className={realAccount?.exchangeStatus === "connected" ? styles.good : styles.off}><i/>{realAccount?.exchangeStatus === "connected" ? "Ready to trade" : "Not connected"}</span>{realAccount?.apiKeyLast4 && <small>••••{realAccount.apiKeyLast4}</small>}</div>
          <div className={styles.chips}><span>Balances</span><span>Spot trading</span><span>No withdrawals</span></div>
          <button className={styles.secondary} onClick={onConnectBinance}>{realAccount?.exchangeStatus === "connected" ? "Manage" : "Connect"}</button>
        </article>
        {providers.map(provider => {
          const connection = connections[provider.id], connected = connection?.status === "connected", permission = connection?.permissionTrade === true, check = checks[provider.id];
          const ready = connected && permission && check?.tradeReady === true;
          return <article className={styles.card} key={provider.id}>
            <div className={styles.brand}><ExchangeLogo provider={provider.id}/><div><b>{provider.name}</b><small>{provider.subtitle}</small></div></div>
            <div className={styles.statusRow}><span className={ready ? styles.good : connected ? styles.warn : styles.off}><i/>{ready ? "Ready to trade" : connected ? "Connected" : "Not connected"}</span>{connection?.apiKeyLast4 && <small>••••{connection.apiKeyLast4}</small>}</div>
            <div className={styles.chips}><span>Balances</span><span>{permission ? "Spot trading" : "Read access"}</span><span>No withdrawals</span></div>
            {connected && !ready && <small className={styles.pending}>Trading activation is completing securely in the background.</small>}
            <button className={styles.secondary} onClick={() => open(provider)}>{connected ? "Manage" : "Connect"}</button>
          </article>;
        })}
      </div>
    </section>
    <div className={styles.security}><span>✓</span><div><b>Trading keys only. Never withdrawal keys.</b><p>LabNarrative checks permissions before storing a connection and keeps live execution behind its protected trading gateway.</p></div></div>

    {selected && <div className={styles.backdrop} onMouseDown={event => { if (event.target === event.currentTarget) close(); }}><div className={styles.modal}>
      <div className={styles.modalHead}><div className={styles.brand}><ExchangeLogo provider={selected.id}/><div><small>{connections[selected.id]?.status === "connected" ? "MANAGE EXCHANGE" : "CONNECT EXCHANGE"}</small><h2>{selected.name}</h2></div></div><button onClick={close}>×</button></div>
      <div className={styles.permissionBox}><b>API permissions</b><span>{selected.permission}</span><small>Do not enable withdrawal, transfer, futures, margin or derivatives permissions.</small></div>
      <form className={styles.form} onSubmit={connect}>
        {selected.coinbase ? <><label><span>API Key Name</span><input value={keyName} onChange={e => setKeyName(e.target.value)} autoComplete="off" placeholder="organizations/.../apiKeys/..."/></label><label><span>EC Private Key</span><textarea rows={6} value={keySecret} onChange={e => setKeySecret(e.target.value)} autoComplete="off" placeholder="-----BEGIN EC PRIVATE KEY-----"/></label></> : <><label><span>API Key</span><input value={apiKey} onChange={e => setApiKey(e.target.value)} autoComplete="off"/></label><label><span>API Secret</span><input type="password" value={apiSecret} onChange={e => setApiSecret(e.target.value)} autoComplete="new-password"/></label>{selected.needsPassphrase && <label><span>API Passphrase</span><input type="password" value={passphrase} onChange={e => setPassphrase(e.target.value)} autoComplete="new-password"/></label>}</>}
        <p>Credentials are sent directly to LabNarrative’s encrypted credential store and are never displayed again.</p>
        {error && <div className={styles.error}>{error}</div>}
        <div className={styles.modalActions}>{connections[selected.id]?.status === "connected" && <button type="button" className={styles.danger} onClick={() => void disconnect(selected.id)} disabled={busy}>Disconnect</button>}<button type="button" className={styles.secondary} onClick={close} disabled={busy}>Cancel</button><button className={styles.primary} disabled={busy}>{busy ? "Verifying…" : connections[selected.id]?.status === "connected" ? "Update connection" : "Connect"}</button></div>
      </form>
    </div></div>}
    {loading && <div className={styles.loading}>Loading exchange connections…</div>}
  </div>;
}
