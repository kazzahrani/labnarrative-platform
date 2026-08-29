"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { browserSupabase } from "../../lib/supabase-browser";
import connectStyles from "./binance-connect.module.css";
import styles from "./overview-command-center.module.css";

type CoinbaseConnection = {
  status: string;
  apiKeyLast4?: string | null;
  permissionRead?: boolean;
  permissionTrade?: boolean;
  permissionWithdraw?: boolean;
  lastVerifiedAt?: string | null;
  metadata?: { portfolioUuidLast4?: string | null; portfolioType?: string | null; signatureAlgorithm?: string | null };
};
type CoinbaseResponse = {
  ok?: boolean;
  connection?: CoinbaseConnection | null;
  totalUsd?: number;
  cashUsd?: number;
  cryptoUsd?: number;
  availableUsd?: number;
  assetCount?: number;
  currency?: string;
  error?: string;
};

function money(value: number | null | undefined) {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(Number.isFinite(amount) ? amount : 0);
}
function coinbaseErrorMessage(value: unknown) {
  const message = value instanceof Error ? value.message : String(value || "coinbase_control_failed");
  if (message.includes("coinbase_read_only_required")) return "Use a Coinbase Advanced Trade API key with View permission only. LabNarrative rejects keys with Trade or Transfer permission in this launch phase.";
  if (message.includes("coinbase_view_permission_required")) return "The Coinbase API key must include View permission.";
  if (message.includes("coinbase_invalid_private_key")) return "Coinbase rejected the private key format. Create an ECDSA Secret API Key for Coinbase App / Advanced Trade and paste the full private key, including the BEGIN/END lines.";
  if (message.includes("invalid_credentials_format")) return "Enter the Coinbase API key name and the complete ECDSA private key shown when you create the Secret API Key.";
  if (message.includes("coinbase_portfolio_required")) return "Coinbase did not return an accessible portfolio for this API key.";
  if (message.includes("coinbase_http_401") || message.includes("coinbase_http_403")) return "Coinbase rejected the API key or JWT signature. Check that this is an ECDSA Coinbase App / Advanced Trade Secret API Key with View-only permission.";
  if (message.includes("credential_not_found")) return "The stored Coinbase credential could not be found. Connect the account again.";
  if (message.includes("real_account_required")) return "Your Real Account must be initialized before connecting Coinbase.";
  return "Coinbase could not be verified. No existing exchange connection or trade was changed.";
}

async function invokeCoinbase(action: string, extra: Record<string, unknown> = {}) {
  const { data, error } = await browserSupabase.functions.invoke("trader-coinbase-control", { body: { action, ...extra } });
  if (error) {
    let message = error.message || "coinbase_control_failed";
    const context = (error as { context?: Response }).context;
    if (context) {
      try {
        const payload = await context.clone().json() as { error?: string };
        if (payload.error) message = payload.error;
      } catch {}
    }
    throw new Error(message);
  }
  const result = (data ?? {}) as CoinbaseResponse;
  if (result.error || result.ok !== true) throw new Error(result.error || "coinbase_control_failed");
  return result;
}

export default function CoinbaseConnectionCard({ realAccountAvailable }: { realAccountAvailable: boolean }) {
  const [connection, setConnection] = useState<CoinbaseConnection | null>(null);
  const [totalUsd, setTotalUsd] = useState<number | null>(null);
  const [cashUsd, setCashUsd] = useState<number | null>(null);
  const [cryptoUsd, setCryptoUsd] = useState<number | null>(null);
  const [availableUsd, setAvailableUsd] = useState<number | null>(null);
  const [assetCount, setAssetCount] = useState<number | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [modal, setModal] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [keySecret, setKeySecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const connected = connection?.status === "connected";

  const applySummary = (result: CoinbaseResponse, fallbackConnection: CoinbaseConnection | null = null) => {
    setConnection(result.connection ?? fallbackConnection);
    setTotalUsd(Number(result.totalUsd ?? 0));
    setCashUsd(Number(result.cashUsd ?? 0));
    setCryptoUsd(Number(result.cryptoUsd ?? 0));
    setAvailableUsd(Number(result.availableUsd ?? 0));
    setAssetCount(Number(result.assetCount ?? 0));
  };

  const load = useCallback(async () => {
    if (!realAccountAvailable) {
      setConnection(null);
      setUnavailable(false);
      return;
    }
    try {
      const status = await invokeCoinbase("status");
      setConnection(status.connection ?? null);
      setUnavailable(false);
      if (status.connection?.status === "connected") {
        try {
          const balances = await invokeCoinbase("balances");
          applySummary(balances, status.connection);
        } catch {
          setTotalUsd(null);
          setCashUsd(null);
          setCryptoUsd(null);
          setAvailableUsd(null);
          setAssetCount(null);
        }
      } else {
        setTotalUsd(null);
        setCashUsd(null);
        setCryptoUsd(null);
        setAvailableUsd(null);
        setAssetCount(null);
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
      const result = await invokeCoinbase("connect", { keyName: keyName.trim(), keySecret });
      applySummary(result);
      setUnavailable(false);
      setKeyName("");
      setKeySecret("");
    } catch (caught) {
      setErrorMessage(coinbaseErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const refresh = async (reverify = false) => {
    if (busy) return;
    setBusy(true);
    setErrorMessage("");
    try {
      const result = await invokeCoinbase(reverify ? "reverify" : "balances");
      applySummary(result, connection);
      setUnavailable(false);
    } catch (caught) {
      setErrorMessage(coinbaseErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (busy || !window.confirm("Disconnect Coinbase from this Real Account? This does not change Binance, Bybit, OKX, or any existing trades.")) return;
    setBusy(true);
    setErrorMessage("");
    try {
      const result = await invokeCoinbase("disconnect");
      setConnection(result.connection ?? null);
      setTotalUsd(null);
      setCashUsd(null);
      setCryptoUsd(null);
      setAvailableUsd(null);
      setAssetCount(null);
      setModal(false);
    } catch (caught) {
      setErrorMessage(coinbaseErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return <>
    <article className={styles.connectionCard}>
      <div className={styles.connectionBrand}><span style={{ background: "#f4f4f4", color: "#111", fontWeight: 900 }}>C</span><div><b>Coinbase</b><small>Advanced Trade · read-only API</small></div></div>
      <div className={styles.connectionMeta}><span className={connected ? styles.connectionGood : styles.connectionOffline}><i/>{connected ? "Connected" : unavailable ? "Status unavailable" : "Not connected"}</span>{connected && connection?.apiKeyLast4 ? <small>Key ending ••••{connection.apiKeyLast4}</small> : <small>{realAccountAvailable ? "Portfolio sync · execution off" : "Real Account not initialized"}</small>}</div>
      <div className={styles.connectionCapabilities}><span>Portfolio</span><span>Read only</span><span>No transfers</span></div>
      {connected && totalUsd != null && <div className={styles.connectionMeta}><small>Portfolio value {money(totalUsd)}</small><small>{assetCount ?? 0} assets</small></div>}
      <button type="button" className={connected ? styles.secondaryButton : styles.primary} onClick={open}>{connected ? "View connection" : "Connect Coinbase"}</button>
    </article>

    {modal && <div className={connectStyles.backdrop} onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setModal(false); }}>
      <section className={connectStyles.modal}>
        <div className={connectStyles.header}><div><span className={connectStyles.kicker}>COINBASE · READ ONLY</span><h2>{connected ? "Coinbase connected" : "Connect Coinbase"}</h2></div><button type="button" className={connectStyles.close} disabled={busy} onClick={() => setModal(false)}>×</button></div>
        {connected ? <div className={connectStyles.success}>
          <div className={connectStyles.successIcon}>✓</div>
          <strong>Advanced Trade API verified and stored securely</strong>
          <p>LabNarrative can read the Coinbase portfolio attached to this API key. Trade and transfer permissions are rejected.</p>
          <div className={connectStyles.securityGrid}>
            <div><span>Mode</span><b>View only</b></div>
            <div><span>API key</span><b>{connection?.apiKeyLast4 ? `••••${connection.apiKeyLast4}` : "Verified"}</b></div>
            <div><span>Total portfolio</span><b>{totalUsd == null ? "—" : money(totalUsd)}</b></div>
            <div><span>Available to trade</span><b>{availableUsd == null ? "—" : money(availableUsd)}</b></div>
            <div><span>Crypto</span><b>{cryptoUsd == null ? "—" : money(cryptoUsd)}</b></div>
            <div><span>Cash equivalents</span><b>{cashUsd == null ? "—" : money(cashUsd)}</b></div>
            <div><span>Signing</span><b>{connection?.metadata?.signatureAlgorithm || "ES256"}</b></div>
            <div><span>Execution</span><b>Disabled</b></div>
          </div>
          {errorMessage && <div className={connectStyles.error}>{errorMessage}</div>}
          <div className={connectStyles.actions}><button type="button" className={connectStyles.secondary} disabled={busy} onClick={() => void disconnect()}>Disconnect</button><button type="button" className={connectStyles.secondary} disabled={busy} onClick={() => void refresh(true)}>{busy ? "Checking…" : "Reverify"}</button><button type="button" className={connectStyles.primary} disabled={busy} onClick={() => void refresh(false)}>{busy ? "Refreshing…" : "Refresh balances"}</button></div>
        </div> : <form className={connectStyles.form} onSubmit={connect}>
          <p className={connectStyles.intro}>Connect a Coinbase Advanced Trade portfolio for read-only balance visibility. This phase cannot place orders or transfer funds.</p>
          <div className={connectStyles.guardrail}><span>✓</span><div><strong>View-only ECDSA key required</strong><p>VIEW ONLY · NO TRADE · NO TRANSFER</p></div></div>
          <p className={connectStyles.note}>In Coinbase Developer Platform, create a Secret API Key for Coinbase App / Advanced Trade, choose ECDSA, restrict it to the portfolio you want, and grant View only. LabNarrative verifies the permissions before storing the credential encrypted server-side.</p>
          <label><span>API Key Name</span><input type="password" value={keyName} onChange={(event) => setKeyName(event.target.value)} autoComplete="off" disabled={busy} placeholder="organizations/.../apiKeys/..." /></label>
          <label><span>Private Key</span><textarea value={keySecret} onChange={(event) => setKeySecret(event.target.value)} autoComplete="off" disabled={busy} rows={6} placeholder={'-----BEGIN EC PRIVATE KEY-----\n...\n-----END EC PRIVATE KEY-----'} style={{ width: "100%", boxSizing: "border-box", border: "1px solid #30383e", borderRadius: 12, background: "#0f1316", color: "#f5f7f8", padding: "13px 14px", font: "inherit", resize: "vertical", outline: "none" }} /></label>
          {errorMessage && <div className={connectStyles.error}>{errorMessage}</div>}
          <p className={connectStyles.liveOff}>Connecting Coinbase does not change Binance live execution or any existing strategy routing.</p>
          <div className={connectStyles.actions}><button type="button" className={connectStyles.secondary} disabled={busy} onClick={() => setModal(false)}>Cancel</button><button type="submit" className={connectStyles.primary} disabled={busy || !keyName.trim() || !keySecret.trim()}>{busy ? "Verifying…" : "Verify & connect"}</button></div>
        </form>}
      </section>
    </div>}
  </>;
}
