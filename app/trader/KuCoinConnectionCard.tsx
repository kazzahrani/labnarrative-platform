"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { browserSupabase } from "../../lib/supabase-browser";
import connectStyles from "./binance-connect.module.css";
import styles from "./overview-command-center.module.css";

type KuCoinConnection = {
  status: string;
  apiKeyLast4?: string | null;
  permissionRead?: boolean;
  permissionTrade?: boolean;
  permissionWithdraw?: boolean;
  externalUidLast4?: string | null;
  lastVerifiedAt?: string | null;
  metadata?: {
    permissions?: string[];
    apiVersion?: string | number | null;
    accountMode?: string | null;
    uidLast4?: string | null;
    isMaster?: boolean | null;
    region?: string | null;
    siteType?: string | null;
    valuationMethod?: string | null;
  };
};
type KuCoinResponse = {
  ok?: boolean;
  connection?: KuCoinConnection | null;
  accountMode?: string;
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
function kucoinErrorMessage(value: unknown) {
  const message = value instanceof Error ? value.message : String(value || "kucoin_control_failed");
  if (message.includes("kucoin_read_only_required")) return "Use a KuCoin API key with General permission only. LabNarrative rejects Spot, Margin, Futures, Earn, Withdrawal, Unified, transfer, and other write-capable permissions.";
  if (message.includes("kucoin_general_permission_required")) return "The KuCoin API key must include General permission so LabNarrative can read account balances.";
  if (message.includes("kucoin_invalid_passphrase")) return "KuCoin rejected the API passphrase. Enter the passphrase you created with this API key.";
  if (message.includes("kucoin_invalid_credentials") || message.includes("kucoin_invalid_signature")) return "KuCoin rejected the API key, secret, or signature. Check the credentials and try again.";
  if (message.includes("kucoin_invalid_timestamp")) return "KuCoin rejected the request timestamp. Try again in a moment; no connection changes were made.";
  if (message.includes("kucoin_ip_restricted")) return "This KuCoin key is restricted to another IP address. Update the key's IP settings or create a General-only key without an incompatible whitelist.";
  if (message.includes("kucoin_permission_denied")) return "KuCoin denied this read request. Confirm General permission is enabled.";
  if (message.includes("kucoin_rate_limited")) return "KuCoin rate-limited the request. Try again shortly.";
  if (message.includes("invalid_credentials_format")) return "Enter the KuCoin API Key, API Secret, and API Passphrase exactly as created in KuCoin API Management.";
  if (message.includes("credential_not_found")) return "The stored KuCoin credential could not be found. Connect the account again.";
  if (message.includes("real_account_required")) return "Your Real Account must be initialized before connecting KuCoin.";
  return "KuCoin could not be verified. No existing exchange connection or trade was changed.";
}

async function invokeKuCoin(action: string, extra: Record<string, unknown> = {}) {
  const { data, error } = await browserSupabase.functions.invoke("trader-kucoin-control", { body: { action, ...extra } });
  if (error) {
    let message = error.message || "kucoin_control_failed";
    const context = (error as { context?: Response }).context;
    if (context) {
      try {
        const payload = await context.clone().json() as { error?: string };
        if (payload.error) message = payload.error;
      } catch {}
    }
    throw new Error(message);
  }
  const result = (data ?? {}) as KuCoinResponse;
  if (result.error || result.ok !== true) throw new Error(result.error || "kucoin_control_failed");
  return result;
}

export default function KuCoinConnectionCard({ realAccountAvailable }: { realAccountAvailable: boolean }) {
  const [connection, setConnection] = useState<KuCoinConnection | null>(null);
  const [accountMode, setAccountMode] = useState<string | null>(null);
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
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const connected = connection?.status === "connected";

  const clearSummary = () => {
    setAccountMode(null);
    setTotalUsd(null);
    setAvailableUsd(null);
    setCashUsd(null);
    setCryptoUsd(null);
    setAssetCount(null);
    setValuedAssetCount(null);
    setUnpricedAssetCount(null);
  };
  const applySummary = (result: KuCoinResponse, fallbackConnection: KuCoinConnection | null = null) => {
    setConnection(result.connection ?? fallbackConnection);
    setAccountMode(result.accountMode ?? result.connection?.metadata?.accountMode ?? fallbackConnection?.metadata?.accountMode ?? null);
    setTotalUsd(Number(result.totalUsd ?? 0));
    setAvailableUsd(Number(result.availableUsd ?? 0));
    setCashUsd(Number(result.cashUsd ?? 0));
    setCryptoUsd(Number(result.cryptoUsd ?? 0));
    setAssetCount(Number(result.assetCount ?? 0));
    setValuedAssetCount(Number(result.valuedAssetCount ?? 0));
    setUnpricedAssetCount(Number(result.unpricedAssetCount ?? 0));
  };

  const load = useCallback(async () => {
    if (!realAccountAvailable) {
      setConnection(null);
      setUnavailable(false);
      clearSummary();
      return;
    }
    try {
      const status = await invokeKuCoin("status");
      setConnection(status.connection ?? null);
      setUnavailable(false);
      if (status.connection?.status === "connected") {
        try {
          const balances = await invokeKuCoin("balances");
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
      const result = await invokeKuCoin("connect", { apiKey: apiKey.trim(), apiSecret: apiSecret.trim(), passphrase: passphrase.trim() });
      applySummary(result);
      setUnavailable(false);
      setApiKey("");
      setApiSecret("");
      setPassphrase("");
    } catch (caught) {
      setErrorMessage(kucoinErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const refresh = async (reverify = false) => {
    if (busy) return;
    setBusy(true);
    setErrorMessage("");
    try {
      const result = await invokeKuCoin(reverify ? "reverify" : "balances");
      applySummary(result, connection);
      setUnavailable(false);
    } catch (caught) {
      setErrorMessage(kucoinErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (busy || !window.confirm("Disconnect KuCoin from this Real Account? This does not change Binance, Bybit, OKX, Coinbase, Kraken, or any existing trades.")) return;
    setBusy(true);
    setErrorMessage("");
    try {
      const result = await invokeKuCoin("disconnect");
      setConnection(result.connection ?? null);
      clearSummary();
      setModal(false);
    } catch (caught) {
      setErrorMessage(kucoinErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return <>
    <article className={styles.connectionCard}>
      <div className={styles.connectionBrand}><span style={{ background: "#f4f4f4", color: "#111", fontWeight: 900 }}>K</span><div><b>KuCoin</b><small>Classic / Unified · read-only API</small></div></div>
      <div className={styles.connectionMeta}><span className={connected ? styles.connectionGood : styles.connectionOffline}><i/>{connected ? "Connected" : unavailable ? "Status unavailable" : "Not connected"}</span>{connected && connection?.apiKeyLast4 ? <small>Key ending ••••{connection.apiKeyLast4}</small> : <small>{realAccountAvailable ? "Balance sync · execution off" : "Real Account not initialized"}</small>}</div>
      <div className={styles.connectionCapabilities}><span>Balances</span><span>General only</span><span>No withdrawals</span></div>
      {connected && totalUsd != null && <div className={styles.connectionMeta}><small>{accountMode || connection?.metadata?.accountMode || "Account"} value {money(totalUsd)}</small><small>{valuedAssetCount ?? 0}/{assetCount ?? 0} assets valued</small></div>}
      <button type="button" className={connected ? styles.secondaryButton : styles.primary} onClick={open}>{connected ? "View connection" : "Connect KuCoin"}</button>
    </article>

    {modal && <div className={connectStyles.backdrop} onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setModal(false); }}>
      <section className={connectStyles.modal}>
        <div className={connectStyles.header}><div><span className={connectStyles.kicker}>KUCOIN · GENERAL ONLY</span><h2>{connected ? "KuCoin connected" : "Connect KuCoin"}</h2></div><button type="button" className={connectStyles.close} disabled={busy} onClick={() => setModal(false)}>×</button></div>
        {connected ? <div className={connectStyles.success}>
          <div className={connectStyles.successIcon}>✓</div>
          <strong>KuCoin API verified and stored securely</strong>
          <p>LabNarrative can read balances from the detected KuCoin account mode. Any permission beyond General is rejected and KuCoin execution stays disabled.</p>
          <div className={connectStyles.securityGrid}>
            <div><span>Mode</span><b>{accountMode || connection?.metadata?.accountMode || "Detected"}</b></div>
            <div><span>API key</span><b>{connection?.apiKeyLast4 ? `••••${connection.apiKeyLast4}` : "Verified"}</b></div>
            <div><span>Total value</span><b>{totalUsd == null ? "—" : money(totalUsd)}</b></div>
            <div><span>Available value</span><b>{availableUsd == null ? "—" : money(availableUsd)}</b></div>
            <div><span>Crypto</span><b>{cryptoUsd == null ? "—" : money(cryptoUsd)}</b></div>
            <div><span>Cash / stable</span><b>{cashUsd == null ? "—" : money(cashUsd)}</b></div>
            <div><span>Valuation coverage</span><b>{valuedAssetCount == null || assetCount == null ? "—" : `${valuedAssetCount}/${assetCount} assets${unpricedAssetCount ? ` · ${unpricedAssetCount} unpriced` : ""}`}</b></div>
            <div><span>API version</span><b>{connection?.metadata?.apiVersion || "Auto-detected"}</b></div>
            <div><span>Permissions</span><b>{connection?.metadata?.permissions?.join(", ") || "General"}</b></div>
            <div><span>Execution</span><b>Disabled</b></div>
          </div>
          {errorMessage && <div className={connectStyles.error}>{errorMessage}</div>}
          <div className={connectStyles.actions}><button type="button" className={connectStyles.secondary} disabled={busy} onClick={() => void disconnect()}>Disconnect</button><button type="button" className={connectStyles.secondary} disabled={busy} onClick={() => void refresh(true)}>{busy ? "Checking…" : "Reverify"}</button><button type="button" className={connectStyles.primary} disabled={busy} onClick={() => void refresh(false)}>{busy ? "Refreshing…" : "Refresh balances"}</button></div>
        </div> : <form className={connectStyles.form} onSubmit={connect}>
          <p className={connectStyles.intro}>Connect KuCoin for read-only Classic or Unified account balance visibility. This phase cannot place orders, transfer funds, use Earn, or withdraw assets.</p>
          <div className={connectStyles.guardrail}><span>✓</span><div><strong>General permission only</strong><p>GENERAL ONLY · NO SPOT TRADE · NO WITHDRAW</p></div></div>
          <p className={connectStyles.note}>In KuCoin API Management, create an API key and enable only General. Leave Spot, Margin, Futures, Earn, Withdrawal, Unified and transfer permissions disabled. Enter the key, secret and the API passphrase you created. LabNarrative verifies KuCoin's own permission report before encrypted storage.</p>
          <label><span>API Key</span><input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} autoComplete="off" disabled={busy} placeholder="Enter inside LabNarrative only" /></label>
          <label><span>API Secret</span><input type="password" value={apiSecret} onChange={(event) => setApiSecret(event.target.value)} autoComplete="new-password" disabled={busy} placeholder="Never share this outside the connection form" /></label>
          <label><span>API Passphrase</span><input type="password" value={passphrase} onChange={(event) => setPassphrase(event.target.value)} autoComplete="new-password" disabled={busy} placeholder="The passphrase created with this API key" /></label>
          {errorMessage && <div className={connectStyles.error}>{errorMessage}</div>}
          <p className={connectStyles.liveOff}>Connecting KuCoin does not change Binance live execution or any existing strategy routing.</p>
          <div className={connectStyles.actions}><button type="button" className={connectStyles.secondary} disabled={busy} onClick={() => setModal(false)}>Cancel</button><button type="submit" className={connectStyles.primary} disabled={busy || !apiKey.trim() || !apiSecret.trim() || !passphrase.trim()}>{busy ? "Verifying…" : "Verify & connect"}</button></div>
        </form>}
      </section>
    </div>}
  </>;
}
