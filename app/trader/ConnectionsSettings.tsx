"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { browserSupabase } from "../../lib/supabase-browser";
import connectStyles from "./binance-connect.module.css";
import OkxConnectionCard from "./OkxConnectionCard";
import styles from "./overview-command-center.module.css";

type RealAccount = {
  id: string;
  name: string;
  exchangeStatus?: string;
  apiKeyLast4?: string | null;
} | null;
type Props = {
  realAccount: RealAccount;
  onConnectBinance: () => void;
  onBackOverview: () => void;
};
type BybitConnection = {
  status: string;
  apiKeyLast4?: string | null;
  permissionRead?: boolean;
  permissionTrade?: boolean;
  permissionWithdraw?: boolean;
  ipRestricted?: boolean | null;
  externalUidLast4?: string | null;
  lastVerifiedAt?: string | null;
  metadata?: { deadlineDay?: number | null; expiredAt?: string | null };
};
type BybitResponse = {
  ok?: boolean;
  connection?: BybitConnection | null;
  totalUsd?: number;
  availableUsd?: number;
  balances?: Array<{ asset: string; equity: number; walletBalance: number; free: number; locked: number; usdValue: number }>;
  error?: string;
};

function money(value: number | null | undefined) {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(Number.isFinite(amount) ? amount : 0);
}
function bybitErrorMessage(value: unknown) {
  const message = value instanceof Error ? value.message : String(value || "bybit_control_failed");
  if (message.includes("bybit_read_only_required")) return "Use a Bybit API key created in Read-Only mode. LabNarrative rejects write-enabled Bybit keys in this launch phase.";
  if (message.includes("bybit_unified_account_required")) return "This connection currently requires a Bybit Unified Trading Account.";
  if (message.includes("invalid_credentials_format")) return "Enter a valid Bybit API key and API secret.";
  if (message.includes("bybit_10003") || message.includes("bybit_10004")) return "Bybit rejected the API credentials or signature. Check the key and secret and try again.";
  if (message.includes("bybit_10005")) return "The Bybit key does not have the required read permission.";
  if (message.includes("bybit_http_403") || message.includes("bybit_10010")) return "Bybit rejected this API request because of region or IP restrictions on the key.";
  if (message.includes("credential_not_found")) return "The stored Bybit credential could not be found. Connect the account again.";
  if (message.includes("real_account_required")) return "Your Real Account must be initialized before connecting Bybit.";
  return "Bybit could not be verified. No connection changes were made.";
}

async function invokeBybit(action: string, extra: Record<string, unknown> = {}) {
  const { data, error } = await browserSupabase.functions.invoke("trader-bybit-control", { body: { action, ...extra } });
  if (error) {
    let message = error.message || "bybit_control_failed";
    const context = (error as { context?: Response }).context;
    if (context) {
      try {
        const payload = await context.clone().json() as { error?: string };
        if (payload.error) message = payload.error;
      } catch {}
    }
    throw new Error(message);
  }
  const result = (data ?? {}) as BybitResponse;
  if (result.error || result.ok !== true) throw new Error(result.error || "bybit_control_failed");
  return result;
}

export default function ConnectionsSettings({ realAccount, onConnectBinance, onBackOverview }: Props) {
  const binanceConnected = realAccount?.exchangeStatus === "connected";
  const [bybitConnection, setBybitConnection] = useState<BybitConnection | null>(null);
  const [bybitTotal, setBybitTotal] = useState<number | null>(null);
  const [bybitAvailable, setBybitAvailable] = useState<number | null>(null);
  const [bybitAssetCount, setBybitAssetCount] = useState<number | null>(null);
  const [bybitUnavailable, setBybitUnavailable] = useState(false);
  const [bybitModal, setBybitModal] = useState(false);
  const [bybitKey, setBybitKey] = useState("");
  const [bybitSecret, setBybitSecret] = useState("");
  const [bybitBusy, setBybitBusy] = useState(false);
  const [bybitError, setBybitError] = useState("");
  const bybitConnected = bybitConnection?.status === "connected";

  const loadBybit = useCallback(async () => {
    try {
      const status = await invokeBybit("status");
      setBybitConnection(status.connection ?? null);
      setBybitUnavailable(false);
      if (status.connection?.status === "connected") {
        try {
          const balances = await invokeBybit("balances");
          setBybitConnection(balances.connection ?? status.connection);
          setBybitTotal(Number(balances.totalUsd ?? 0));
          setBybitAvailable(Number(balances.availableUsd ?? 0));
          setBybitAssetCount(balances.balances?.length ?? 0);
        } catch {
          setBybitTotal(null);
          setBybitAvailable(null);
          setBybitAssetCount(null);
        }
      } else {
        setBybitTotal(null);
        setBybitAvailable(null);
        setBybitAssetCount(null);
      }
    } catch {
      setBybitUnavailable(true);
    }
  }, []);

  useEffect(() => { void loadBybit(); }, [loadBybit]);

  const openBybit = () => {
    setBybitError("");
    setBybitModal(true);
    if (bybitConnected) void loadBybit();
  };

  const connectBybit = async (event: FormEvent) => {
    event.preventDefault();
    if (bybitBusy) return;
    setBybitBusy(true);
    setBybitError("");
    try {
      const result = await invokeBybit("connect", { apiKey: bybitKey.trim(), apiSecret: bybitSecret.trim() });
      setBybitConnection(result.connection ?? null);
      setBybitTotal(Number(result.totalUsd ?? 0));
      setBybitAvailable(Number(result.availableUsd ?? 0));
      setBybitAssetCount(result.balances?.length ?? 0);
      setBybitUnavailable(false);
      setBybitKey("");
      setBybitSecret("");
    } catch (caught) {
      setBybitError(bybitErrorMessage(caught));
    } finally {
      setBybitBusy(false);
    }
  };

  const refreshBybit = async (reverify = false) => {
    if (bybitBusy) return;
    setBybitBusy(true);
    setBybitError("");
    try {
      const result = await invokeBybit(reverify ? "reverify" : "balances");
      setBybitConnection(result.connection ?? bybitConnection);
      setBybitTotal(Number(result.totalUsd ?? 0));
      setBybitAvailable(Number(result.availableUsd ?? 0));
      setBybitAssetCount(result.balances?.length ?? 0);
      setBybitUnavailable(false);
    } catch (caught) {
      setBybitError(bybitErrorMessage(caught));
    } finally {
      setBybitBusy(false);
    }
  };

  const disconnectBybit = async () => {
    if (bybitBusy || !window.confirm("Disconnect Bybit from this Real Account? This does not change your Binance connection or any existing trades.")) return;
    setBybitBusy(true);
    setBybitError("");
    try {
      const result = await invokeBybit("disconnect");
      setBybitConnection(result.connection ?? null);
      setBybitTotal(null);
      setBybitAvailable(null);
      setBybitAssetCount(null);
      setBybitModal(false);
    } catch (caught) {
      setBybitError(bybitErrorMessage(caught));
    } finally {
      setBybitBusy(false);
    }
  };

  return <div className={styles.connectionsPage}>
    <div className={styles.heading}>
      <div><small>SETTINGS</small><h1>Connections</h1><p>Manage the external accounts that supply balances, assets and execution access to LabNarrative.</p></div>
      <button type="button" className={styles.backButton} onClick={onBackOverview}>← Overview</button>
    </div>

    <section className={styles.connectionSection}>
      <div className={styles.sectionTitle}><div><small>EXCHANGES</small><h2>Exchange connections</h2><p>Connections are attached to your Real Account. Paper trading never requires an exchange.</p></div></div>
      <div className={styles.connectionCards} style={{ gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 12 }}>
        <article className={styles.connectionCard}>
          <div className={styles.connectionBrand}><span>◆</span><div><b>Binance</b><small>Spot trading · API connection</small></div></div>
          <div className={styles.connectionMeta}><span className={binanceConnected ? styles.connectionGood : styles.connectionOffline}><i/>{binanceConnected ? "Connected" : "Not connected"}</span>{binanceConnected && realAccount?.apiKeyLast4 ? <small>Key ending ••••{realAccount.apiKeyLast4}</small> : <small>{realAccount ? "Real Account available" : "Real Account not initialized"}</small>}</div>
          <div className={styles.connectionCapabilities}><span>Balances</span><span>Spot orders</span><span>No withdrawals</span></div>
          <button type="button" className={binanceConnected ? styles.secondaryButton : styles.primary} onClick={onConnectBinance}>{binanceConnected ? "View connection" : "Connect Binance"}</button>
        </article>

        <article className={styles.connectionCard}>
          <div className={styles.connectionBrand}><span style={{ background: "#f2f2f2", color: "#161616", fontWeight: 800 }}>B</span><div><b>Bybit</b><small>Unified account · read-only API</small></div></div>
          <div className={styles.connectionMeta}><span className={bybitConnected ? styles.connectionGood : styles.connectionOffline}><i/>{bybitConnected ? "Connected" : bybitUnavailable ? "Status unavailable" : "Not connected"}</span>{bybitConnected && bybitConnection?.apiKeyLast4 ? <small>Key ending ••••{bybitConnection.apiKeyLast4}</small> : <small>Balance sync · execution off</small>}</div>
          <div className={styles.connectionCapabilities}><span>Balances</span><span>Read only</span><span>No withdrawals</span></div>
          {bybitConnected && bybitTotal != null && <div className={styles.connectionMeta}><small>Unified equity {money(bybitTotal)}</small><small>{bybitAssetCount ?? 0} assets</small></div>}
          <button type="button" className={bybitConnected ? styles.secondaryButton : styles.primary} onClick={openBybit}>{bybitConnected ? "View connection" : "Connect Bybit"}</button>
        </article>

        <OkxConnectionCard realAccountAvailable={Boolean(realAccount)} />
      </div>
      <div className={styles.plannedConnections}><span><b>Coinbase</b><small>Planned</small></span><span><b>Kraken</b><small>Planned</small></span><span><b>KuCoin</b><small>Planned</small></span></div>
    </section>

    <section className={styles.connectionSection}>
      <div className={styles.sectionTitle}><div><small>WALLETS</small><h2>Wallet connections</h2><p>Wallet importing is not enabled yet, so LabNarrative does not currently read or store wallet addresses for the trading workspace.</p></div></div>
      <div className={styles.walletEmpty}><span>◇</span><div><b>No wallet connector enabled</b><small>This area is reserved for future read-only wallet portfolio connections. No nonfunctional connect button is shown until the feature is implemented.</small></div></div>
    </section>

    <section className={styles.securityNote}><span>✓</span><div><b>Connection security</b><p>Binance keeps its fixed-IP execution gateway and existing live-trading safeguards. Bybit and OKX are isolated read-only balance connections in this phase; write-enabled keys are rejected and LabNarrative does not send orders to either exchange.</p></div></section>

    {bybitModal && <div className={connectStyles.backdrop} onMouseDown={(event) => { if (event.target === event.currentTarget && !bybitBusy) setBybitModal(false); }}>
      <section className={connectStyles.modal}>
        <div className={connectStyles.header}><div><span className={connectStyles.kicker}>BYBIT · READ ONLY</span><h2>{bybitConnected ? "Bybit connected" : "Connect Bybit"}</h2></div><button type="button" className={connectStyles.close} disabled={bybitBusy} onClick={() => setBybitModal(false)}>×</button></div>
        {bybitConnected ? <div className={connectStyles.success}>
          <div className={connectStyles.successIcon}>✓</div>
          <strong>API verified and stored securely</strong>
          <p>LabNarrative can read your Bybit Unified Account balances. Bybit trading and withdrawals are not enabled.</p>
          <div className={connectStyles.securityGrid}>
            <div><span>Mode</span><b>Read only</b></div>
            <div><span>API key</span><b>{bybitConnection?.apiKeyLast4 ? `••••${bybitConnection.apiKeyLast4}` : "Verified"}</b></div>
            <div><span>Unified equity</span><b>{bybitTotal == null ? "—" : money(bybitTotal)}</b></div>
            <div><span>Available USD</span><b>{bybitAvailable == null ? "—" : money(bybitAvailable)}</b></div>
            <div><span>IP binding</span><b>{bybitConnection?.ipRestricted ? "Bound" : "Not bound"}</b></div>
            <div><span>Execution</span><b>Disabled</b></div>
          </div>
          {bybitError && <div className={connectStyles.error}>{bybitError}</div>}
          <div className={connectStyles.actions}><button type="button" className={connectStyles.secondary} disabled={bybitBusy} onClick={() => void disconnectBybit()}>Disconnect</button><button type="button" className={connectStyles.secondary} disabled={bybitBusy} onClick={() => void refreshBybit(true)}>{bybitBusy ? "Checking…" : "Reverify"}</button><button type="button" className={connectStyles.primary} disabled={bybitBusy} onClick={() => void refreshBybit(false)}>{bybitBusy ? "Refreshing…" : "Refresh balances"}</button></div>
        </div> : <form className={connectStyles.form} onSubmit={connectBybit}>
          <p className={connectStyles.intro}>Connect a Bybit Unified Trading Account for balance visibility. This launch integration intentionally does not have order permissions.</p>
          <div className={connectStyles.guardrail}><span>✓</span><div><strong>Read-only key required</strong><p>READ ONLY · NO ORDER EXECUTION</p></div></div>
          <p className={connectStyles.note}>In Bybit, create an API key with Read-Only selected. LabNarrative verifies the key with Bybit before storing it encrypted server-side.</p>
          <label><span>API Key</span><input type="password" value={bybitKey} onChange={(event) => setBybitKey(event.target.value)} autoComplete="off" disabled={bybitBusy} placeholder="Enter inside LabNarrative only" /></label>
          <label><span>API Secret</span><input type="password" value={bybitSecret} onChange={(event) => setBybitSecret(event.target.value)} autoComplete="new-password" disabled={bybitBusy} placeholder="Never share this outside the connection form" /></label>
          {bybitError && <div className={connectStyles.error}>{bybitError}</div>}
          <p className={connectStyles.liveOff}>Connecting Bybit does not change your Binance live-execution settings.</p>
          <div className={connectStyles.actions}><button type="button" className={connectStyles.secondary} disabled={bybitBusy} onClick={() => setBybitModal(false)}>Cancel</button><button type="submit" className={connectStyles.primary} disabled={bybitBusy || !bybitKey.trim() || !bybitSecret.trim()}>{bybitBusy ? "Verifying…" : "Verify & connect"}</button></div>
        </form>}
      </section>
    </div>}
  </div>;
}
