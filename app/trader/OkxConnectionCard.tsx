"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { browserSupabase } from "../../lib/supabase-browser";
import connectStyles from "./binance-connect.module.css";
import styles from "./overview-command-center.module.css";

type OkxConnection = {
  status: string;
  apiKeyLast4?: string | null;
  permissionRead?: boolean;
  permissionTrade?: boolean;
  permissionWithdraw?: boolean;
  ipRestricted?: boolean | null;
  externalUidLast4?: string | null;
  lastVerifiedAt?: string | null;
  metadata?: { accountLevel?: string | null; label?: string | null; ipCount?: number | null };
};
type OkxResponse = {
  ok?: boolean;
  connection?: OkxConnection | null;
  totalUsd?: number;
  tradingUsd?: number;
  fundingUsd?: number;
  earnUsd?: number;
  tradingAssetCount?: number;
  fundingAssetCount?: number;
  error?: string;
};

function money(value: number | null | undefined) {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(Number.isFinite(amount) ? amount : 0);
}
function okxErrorMessage(value: unknown) {
  const message = value instanceof Error ? value.message : String(value || "okx_control_failed");
  if (message.includes("okx_read_only_required")) return "Use an OKX API key with Read permission only. LabNarrative rejects keys with Trade or Withdraw permission in this launch phase.";
  if (message.includes("okx_read_permission_required")) return "The OKX key must include Read permission.";
  if (message.includes("invalid_credentials_format")) return "Enter a valid OKX API key, secret key, and passphrase.";
  if (message.includes("okx_50111") || message.includes("okx_50113") || message.includes("okx_50105")) return "OKX rejected the API credentials, passphrase, or signature. Check all three values and try again.";
  if (message.includes("okx_50102")) return "OKX rejected the request timestamp. Try again in a moment.";
  if (message.includes("okx_http_403")) return "OKX rejected this API request because of regional or IP restrictions.";
  if (message.includes("credential_not_found")) return "The stored OKX credential could not be found. Connect the account again.";
  if (message.includes("real_account_required")) return "Your Real Account must be initialized before connecting OKX.";
  return "OKX could not be verified. No existing exchange connection or trade was changed.";
}

async function invokeOkx(action: string, extra: Record<string, unknown> = {}) {
  const { data, error } = await browserSupabase.functions.invoke("trader-okx-control", { body: { action, ...extra } });
  if (error) {
    let message = error.message || "okx_control_failed";
    const context = (error as { context?: Response }).context;
    if (context) {
      try {
        const payload = await context.clone().json() as { error?: string };
        if (payload.error) message = payload.error;
      } catch {}
    }
    throw new Error(message);
  }
  const result = (data ?? {}) as OkxResponse;
  if (result.error || result.ok !== true) throw new Error(result.error || "okx_control_failed");
  return result;
}

export default function OkxConnectionCard({ realAccountAvailable }: { realAccountAvailable: boolean }) {
  const [connection, setConnection] = useState<OkxConnection | null>(null);
  const [totalUsd, setTotalUsd] = useState<number | null>(null);
  const [tradingUsd, setTradingUsd] = useState<number | null>(null);
  const [fundingUsd, setFundingUsd] = useState<number | null>(null);
  const [tradingAssetCount, setTradingAssetCount] = useState<number | null>(null);
  const [fundingAssetCount, setFundingAssetCount] = useState<number | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [modal, setModal] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const connected = connection?.status === "connected";

  const applySummary = (result: OkxResponse, fallbackConnection: OkxConnection | null = null) => {
    setConnection(result.connection ?? fallbackConnection);
    setTotalUsd(Number(result.totalUsd ?? 0));
    setTradingUsd(Number(result.tradingUsd ?? 0));
    setFundingUsd(Number(result.fundingUsd ?? 0));
    setTradingAssetCount(Number(result.tradingAssetCount ?? 0));
    setFundingAssetCount(Number(result.fundingAssetCount ?? 0));
  };

  const load = useCallback(async () => {
    if (!realAccountAvailable) {
      setConnection(null);
      setUnavailable(false);
      return;
    }
    try {
      const status = await invokeOkx("status");
      setConnection(status.connection ?? null);
      setUnavailable(false);
      if (status.connection?.status === "connected") {
        try {
          const balances = await invokeOkx("balances");
          applySummary(balances, status.connection);
        } catch {
          setTotalUsd(null);
          setTradingUsd(null);
          setFundingUsd(null);
          setTradingAssetCount(null);
          setFundingAssetCount(null);
        }
      } else {
        setTotalUsd(null);
        setTradingUsd(null);
        setFundingUsd(null);
        setTradingAssetCount(null);
        setFundingAssetCount(null);
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
      const result = await invokeOkx("connect", {
        apiKey: apiKey.trim(),
        apiSecret: apiSecret.trim(),
        passphrase: passphrase.trim(),
      });
      applySummary(result);
      setUnavailable(false);
      setApiKey("");
      setApiSecret("");
      setPassphrase("");
    } catch (caught) {
      setErrorMessage(okxErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const refresh = async (reverify = false) => {
    if (busy) return;
    setBusy(true);
    setErrorMessage("");
    try {
      const result = await invokeOkx(reverify ? "reverify" : "balances");
      applySummary(result, connection);
      setUnavailable(false);
    } catch (caught) {
      setErrorMessage(okxErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (busy || !window.confirm("Disconnect OKX from this Real Account? This does not change Binance, Bybit, or any existing trades.")) return;
    setBusy(true);
    setErrorMessage("");
    try {
      const result = await invokeOkx("disconnect");
      setConnection(result.connection ?? null);
      setTotalUsd(null);
      setTradingUsd(null);
      setFundingUsd(null);
      setTradingAssetCount(null);
      setFundingAssetCount(null);
      setModal(false);
    } catch (caught) {
      setErrorMessage(okxErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return <>
    <article className={styles.connectionCard}>
      <div className={styles.connectionBrand}><span style={{ background: "#f4f4f4", color: "#111", fontWeight: 900, letterSpacing: "-1px" }}>OK</span><div><b>OKX</b><small>Account valuation · read-only API</small></div></div>
      <div className={styles.connectionMeta}><span className={connected ? styles.connectionGood : styles.connectionOffline}><i/>{connected ? "Connected" : unavailable ? "Status unavailable" : "Not connected"}</span>{connected && connection?.apiKeyLast4 ? <small>Key ending ••••{connection.apiKeyLast4}</small> : <small>{realAccountAvailable ? "Balance sync · execution off" : "Real Account not initialized"}</small>}</div>
      <div className={styles.connectionCapabilities}><span>Balances</span><span>Read only</span><span>No withdrawals</span></div>
      {connected && totalUsd != null && <div className={styles.connectionMeta}><small>Account value {money(totalUsd)}</small><small>{(tradingAssetCount ?? 0) + (fundingAssetCount ?? 0)} balance rows</small></div>}
      <button type="button" className={connected ? styles.secondaryButton : styles.primary} onClick={open}>{connected ? "View connection" : "Connect OKX"}</button>
    </article>

    {modal && <div className={connectStyles.backdrop} onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setModal(false); }}>
      <section className={connectStyles.modal}>
        <div className={connectStyles.header}><div><span className={connectStyles.kicker}>OKX · READ ONLY</span><h2>{connected ? "OKX connected" : "Connect OKX"}</h2></div><button type="button" className={connectStyles.close} disabled={busy} onClick={() => setModal(false)}>×</button></div>
        {connected ? <div className={connectStyles.success}>
          <div className={connectStyles.successIcon}>✓</div>
          <strong>API verified and stored securely</strong>
          <p>LabNarrative can read OKX account valuation, Trading Account balances, and Funding Account balances. OKX trading and withdrawals are disabled.</p>
          <div className={connectStyles.securityGrid}>
            <div><span>Mode</span><b>Read only</b></div>
            <div><span>API key</span><b>{connection?.apiKeyLast4 ? `••••${connection.apiKeyLast4}` : "Verified"}</b></div>
            <div><span>Total account</span><b>{totalUsd == null ? "—" : money(totalUsd)}</b></div>
            <div><span>Trading</span><b>{tradingUsd == null ? "—" : money(tradingUsd)}</b></div>
            <div><span>Funding</span><b>{fundingUsd == null ? "—" : money(fundingUsd)}</b></div>
            <div><span>IP binding</span><b>{connection?.ipRestricted ? "Bound" : "Not bound"}</b></div>
            <div><span>Account mode</span><b>{connection?.metadata?.accountLevel || "Verified"}</b></div>
            <div><span>Execution</span><b>Disabled</b></div>
          </div>
          {errorMessage && <div className={connectStyles.error}>{errorMessage}</div>}
          <div className={connectStyles.actions}><button type="button" className={connectStyles.secondary} disabled={busy} onClick={() => void disconnect()}>Disconnect</button><button type="button" className={connectStyles.secondary} disabled={busy} onClick={() => void refresh(true)}>{busy ? "Checking…" : "Reverify"}</button><button type="button" className={connectStyles.primary} disabled={busy} onClick={() => void refresh(false)}>{busy ? "Refreshing…" : "Refresh balances"}</button></div>
        </div> : <form className={connectStyles.form} onSubmit={connect}>
          <p className={connectStyles.intro}>Connect OKX for read-only account valuation and balance visibility. This phase cannot place, cancel, transfer, or withdraw.</p>
          <div className={connectStyles.guardrail}><span>✓</span><div><strong>Read-only key required</strong><p>READ ONLY · NO TRADE · NO WITHDRAW</p></div></div>
          <p className={connectStyles.note}>In OKX, create an API key with Read permission only. The key has three values: API Key, Secret Key, and Passphrase. LabNarrative verifies permissions before storing them encrypted server-side.</p>
          <label><span>API Key</span><input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} autoComplete="off" disabled={busy} placeholder="Enter inside LabNarrative only" /></label>
          <label><span>Secret Key</span><input type="password" value={apiSecret} onChange={(event) => setApiSecret(event.target.value)} autoComplete="new-password" disabled={busy} placeholder="Never share this outside the connection form" /></label>
          <label><span>Passphrase</span><input type="password" value={passphrase} onChange={(event) => setPassphrase(event.target.value)} autoComplete="new-password" disabled={busy} placeholder="The passphrase you created in OKX" /></label>
          {errorMessage && <div className={connectStyles.error}>{errorMessage}</div>}
          <p className={connectStyles.liveOff}>Connecting OKX does not change Binance live execution or any existing strategy routing.</p>
          <div className={connectStyles.actions}><button type="button" className={connectStyles.secondary} disabled={busy} onClick={() => setModal(false)}>Cancel</button><button type="submit" className={connectStyles.primary} disabled={busy || !apiKey.trim() || !apiSecret.trim() || !passphrase.trim()}>{busy ? "Verifying…" : "Verify & connect"}</button></div>
        </form>}
      </section>
    </div>}
  </>;
}
