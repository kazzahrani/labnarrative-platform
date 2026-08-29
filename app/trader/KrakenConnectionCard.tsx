"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { browserSupabase } from "../../lib/supabase-browser";
import connectStyles from "./binance-connect.module.css";
import styles from "./overview-command-center.module.css";

type KrakenConnection = {
  status: string;
  apiKeyLast4?: string | null;
  permissionRead?: boolean;
  permissionTrade?: boolean;
  permissionWithdraw?: boolean;
  ipRestricted?: boolean | null;
  lastVerifiedAt?: string | null;
  metadata?: {
    apiKeyName?: string | null;
    permissions?: string[];
    ipAllowlistCount?: number | null;
    validUntil?: string | number | null;
    valuationMethod?: string | null;
  };
};
type KrakenResponse = {
  ok?: boolean;
  connection?: KrakenConnection | null;
  totalUsd?: number;
  availableUsd?: number;
  cashUsd?: number;
  cryptoUsd?: number;
  assetCount?: number;
  valuedAssetCount?: number;
  unpricedAssetCount?: number;
  currency?: string;
  error?: string;
};

function money(value: number | null | undefined) {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(Number.isFinite(amount) ? amount : 0);
}
function krakenErrorMessage(value: unknown) {
  const message = value instanceof Error ? value.message : String(value || "kraken_control_failed");
  if (message.includes("kraken_read_only_required")) return "Use a Kraken Spot API key without Deposit, Withdraw, Earn, Create/Modify Orders, Cancel/Close Orders, or withdrawal-address permissions. LabNarrative rejects write-enabled Kraken keys.";
  if (message.includes("kraken_query_funds_required")) return "The Kraken API key must include Query Funds permission so LabNarrative can read balances.";
  if (message.includes("kraken_invalid_credentials") || message.includes("kraken_invalid_signature")) return "Kraken rejected the API key or private key. Check both values and try again.";
  if (message.includes("kraken_invalid_secret_format")) return "The Kraken private key is not in the expected Base64 secret format.";
  if (message.includes("kraken_invalid_nonce")) return "Kraken rejected the request nonce. Wait a moment and try again; no connection changes were made.";
  if (message.includes("kraken_permission_denied")) return "Kraken denied this API request. Confirm Query Funds is enabled and write permissions are disabled.";
  if (message.includes("kraken_temporary_lockout")) return "Kraken temporarily locked API requests for this key. Wait before trying again.";
  if (message.includes("kraken_rate_limited")) return "Kraken rate-limited the request. Try again shortly.";
  if (message.includes("invalid_credentials_format")) return "Enter the Kraken API Key and Private Key exactly as shown when the Spot API key was created.";
  if (message.includes("credential_not_found")) return "The stored Kraken credential could not be found. Connect the account again.";
  if (message.includes("real_account_required")) return "Your Real Account must be initialized before connecting Kraken.";
  return "Kraken could not be verified. No existing exchange connection or trade was changed.";
}

async function invokeKraken(action: string, extra: Record<string, unknown> = {}) {
  const { data, error } = await browserSupabase.functions.invoke("trader-kraken-control", { body: { action, ...extra } });
  if (error) {
    let message = error.message || "kraken_control_failed";
    const context = (error as { context?: Response }).context;
    if (context) {
      try {
        const payload = await context.clone().json() as { error?: string };
        if (payload.error) message = payload.error;
      } catch {}
    }
    throw new Error(message);
  }
  const result = (data ?? {}) as KrakenResponse;
  if (result.error || result.ok !== true) throw new Error(result.error || "kraken_control_failed");
  return result;
}

export default function KrakenConnectionCard({ realAccountAvailable }: { realAccountAvailable: boolean }) {
  const [connection, setConnection] = useState<KrakenConnection | null>(null);
  const [totalUsd, setTotalUsd] = useState<number | null>(null);
  const [availableUsd, setAvailableUsd] = useState<number | null>(null);
  const [cashUsd, setCashUsd] = useState<number | null>(null);
  const [cryptoUsd, setCryptoUsd] = useState<number | null>(null);
  const [assetCount, setAssetCount] = useState<number | null>(null);
  const [valuedAssetCount, setValuedAssetCount] = useState<number | null>(null);
  const [unpricedAssetCount, setUnpricedAssetCount] = useState<number | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [modal, setModal] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const connected = connection?.status === "connected";

  const applySummary = (result: KrakenResponse, fallbackConnection: KrakenConnection | null = null) => {
    setConnection(result.connection ?? fallbackConnection);
    setTotalUsd(Number(result.totalUsd ?? 0));
    setAvailableUsd(Number(result.availableUsd ?? 0));
    setCashUsd(Number(result.cashUsd ?? 0));
    setCryptoUsd(Number(result.cryptoUsd ?? 0));
    setAssetCount(Number(result.assetCount ?? 0));
    setValuedAssetCount(Number(result.valuedAssetCount ?? 0));
    setUnpricedAssetCount(Number(result.unpricedAssetCount ?? 0));
  };

  const clearSummary = () => {
    setTotalUsd(null);
    setAvailableUsd(null);
    setCashUsd(null);
    setCryptoUsd(null);
    setAssetCount(null);
    setValuedAssetCount(null);
    setUnpricedAssetCount(null);
  };

  const load = useCallback(async () => {
    if (!realAccountAvailable) {
      setConnection(null);
      setUnavailable(false);
      clearSummary();
      return;
    }
    try {
      const status = await invokeKraken("status");
      setConnection(status.connection ?? null);
      setUnavailable(false);
      if (status.connection?.status === "connected") {
        try {
          const balances = await invokeKraken("balances");
          applySummary(balances, status.connection);
        } catch {
          clearSummary();
        }
      } else {
        clearSummary();
      }
    } catch {
      setUnavailable(true);
    }
  }, [realAccountAvailable]);

  useEffect(() => { void load(); }, [load]);

  const open = () => {
    setErrorMessage("");
    setModal(true);
    if (connected) void load();
  };

  const connect = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setErrorMessage("");
    try {
      const result = await invokeKraken("connect", { apiKey: apiKey.trim(), apiSecret: apiSecret.trim() });
      applySummary(result);
      setUnavailable(false);
      setApiKey("");
      setApiSecret("");
    } catch (caught) {
      setErrorMessage(krakenErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const refresh = async (reverify = false) => {
    if (busy) return;
    setBusy(true);
    setErrorMessage("");
    try {
      const result = await invokeKraken(reverify ? "reverify" : "balances");
      applySummary(result, connection);
      setUnavailable(false);
    } catch (caught) {
      setErrorMessage(krakenErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (busy || !window.confirm("Disconnect Kraken from this Real Account? This does not change Binance, Bybit, OKX, Coinbase, or any existing trades.")) return;
    setBusy(true);
    setErrorMessage("");
    try {
      const result = await invokeKraken("disconnect");
      setConnection(result.connection ?? null);
      clearSummary();
      setModal(false);
    } catch (caught) {
      setErrorMessage(krakenErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return <>
    <article className={styles.connectionCard}>
      <div className={styles.connectionBrand}><span style={{ background: "#f4f4f4", color: "#111", fontWeight: 900 }}>K</span><div><b>Kraken</b><small>Spot balances · read-only API</small></div></div>
      <div className={styles.connectionMeta}><span className={connected ? styles.connectionGood : styles.connectionOffline}><i/>{connected ? "Connected" : unavailable ? "Status unavailable" : "Not connected"}</span>{connected && connection?.apiKeyLast4 ? <small>Key ending ••••{connection.apiKeyLast4}</small> : <small>{realAccountAvailable ? "Balance sync · execution off" : "Real Account not initialized"}</small>}</div>
      <div className={styles.connectionCapabilities}><span>Balances</span><span>Read only</span><span>No withdrawals</span></div>
      {connected && totalUsd != null && <div className={styles.connectionMeta}><small>Priced value {money(totalUsd)}</small><small>{valuedAssetCount ?? 0}/{assetCount ?? 0} assets valued</small></div>}
      <button type="button" className={connected ? styles.secondaryButton : styles.primary} onClick={open}>{connected ? "View connection" : "Connect Kraken"}</button>
    </article>

    {modal && <div className={connectStyles.backdrop} onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setModal(false); }}>
      <section className={connectStyles.modal}>
        <div className={connectStyles.header}><div><span className={connectStyles.kicker}>KRAKEN · READ ONLY</span><h2>{connected ? "Kraken connected" : "Connect Kraken"}</h2></div><button type="button" className={connectStyles.close} disabled={busy} onClick={() => setModal(false)}>×</button></div>
        {connected ? <div className={connectStyles.success}>
          <div className={connectStyles.successIcon}>✓</div>
          <strong>Spot API verified and stored securely</strong>
          <p>LabNarrative can read Kraken extended spot balances. Write-enabled API keys are rejected and Kraken execution is disabled.</p>
          <div className={connectStyles.securityGrid}>
            <div><span>Mode</span><b>Read only</b></div>
            <div><span>API key</span><b>{connection?.apiKeyLast4 ? `••••${connection.apiKeyLast4}` : "Verified"}</b></div>
            <div><span>Priced value</span><b>{totalUsd == null ? "—" : money(totalUsd)}</b></div>
            <div><span>Available value</span><b>{availableUsd == null ? "—" : money(availableUsd)}</b></div>
            <div><span>Crypto</span><b>{cryptoUsd == null ? "—" : money(cryptoUsd)}</b></div>
            <div><span>Cash / stable</span><b>{cashUsd == null ? "—" : money(cashUsd)}</b></div>
            <div><span>Valuation coverage</span><b>{valuedAssetCount == null || assetCount == null ? "—" : `${valuedAssetCount}/${assetCount} assets${unpricedAssetCount ? ` · ${unpricedAssetCount} unpriced` : ""}`}</b></div>
            <div><span>IP allowlist</span><b>{connection?.ipRestricted ? `Enabled${connection.metadata?.ipAllowlistCount ? ` · ${connection.metadata.ipAllowlistCount}` : ""}` : "Not set"}</b></div>
            <div><span>Key permissions</span><b>{connection?.metadata?.permissions?.join(", ") || "Query Funds"}</b></div>
            <div><span>Execution</span><b>Disabled</b></div>
          </div>
          {errorMessage && <div className={connectStyles.error}>{errorMessage}</div>}
          <div className={connectStyles.actions}><button type="button" className={connectStyles.secondary} disabled={busy} onClick={() => void disconnect()}>Disconnect</button><button type="button" className={connectStyles.secondary} disabled={busy} onClick={() => void refresh(true)}>{busy ? "Checking…" : "Reverify"}</button><button type="button" className={connectStyles.primary} disabled={busy} onClick={() => void refresh(false)}>{busy ? "Refreshing…" : "Refresh balances"}</button></div>
        </div> : <form className={connectStyles.form} onSubmit={connect}>
          <p className={connectStyles.intro}>Connect Kraken Spot for read-only balance visibility. This phase cannot place or cancel orders, deposit, withdraw, allocate Earn funds, or modify withdrawal addresses.</p>
          <div className={connectStyles.guardrail}><span>✓</span><div><strong>Query Funds key required</strong><p>READ ONLY · NO TRADE · NO WITHDRAW</p></div></div>
          <p className={connectStyles.note}>In Kraken Pro, create a Spot API key with Query Funds enabled. Leave Deposit Funds, Withdraw Funds, Earn Funds, Create &amp; Modify Orders, Cancel &amp; Close Orders, and withdrawal-address permissions disabled. LabNarrative checks Kraken's own API-key permission report before storing the credential encrypted server-side.</p>
          <label><span>API Key</span><input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} autoComplete="off" disabled={busy} placeholder="Enter inside LabNarrative only" /></label>
          <label><span>Private Key</span><input type="password" value={apiSecret} onChange={(event) => setApiSecret(event.target.value)} autoComplete="new-password" disabled={busy} placeholder="Never share this outside the connection form" /></label>
          {errorMessage && <div className={connectStyles.error}>{errorMessage}</div>}
          <p className={connectStyles.liveOff}>Connecting Kraken does not change Binance live execution or any existing strategy routing.</p>
          <div className={connectStyles.actions}><button type="button" className={connectStyles.secondary} disabled={busy} onClick={() => setModal(false)}>Cancel</button><button type="submit" className={connectStyles.primary} disabled={busy || !apiKey.trim() || !apiSecret.trim()}>{busy ? "Verifying…" : "Verify & connect"}</button></div>
        </form>}
      </section>
    </div>}
  </>;
}
