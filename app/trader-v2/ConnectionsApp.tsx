"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { browserSupabase } from "../../lib/supabase-browser";
import ExchangeLogo, { exchangeName } from "../trader/ExchangeLogo";
import styles from "./trader-app.module.css";
import manage from "./connections-management.module.css";

type LaunchProvider = "binance" | "bybit" | "okx" | "kucoin";
type Connection = {
  provider: string;
  environment: string;
  status: string;
  apiKeyLast4: string | null;
  permissionRead: boolean;
  permissionTrade: boolean;
  permissionWithdraw: boolean;
  permissionInternalTransfer: boolean | null;
  ipRestricted: boolean | null;
  lastVerifiedAt: string | null;
  verificationAgeMs: number | null;
  lastError: string | null;
  coreV2Supported: boolean;
  portfolioFresh: boolean | null;
  portfolioTotalUsd: number | null;
  portfolioAssetCount: number | null;
  portfolioSourceAt: string | null;
};
type ConnectionsReadResponse = {
  ok?: boolean;
  ready?: boolean;
  account?: { id: string; name: string; mode: string };
  connections?: Connection[];
  error?: string;
};
type ControlResponse = { ok?: boolean; error?: string; connection?: unknown; connections?: unknown[] };

const PROVIDERS: Array<{ id: LaunchProvider; passphrase: boolean }> = [
  { id: "binance", passphrase: false },
  { id: "bybit", passphrase: false },
  { id: "okx", passphrase: true },
  { id: "kucoin", passphrase: true },
];
const NAV = [
  ["/", "Overview"],
  ["/portfolio", "Portfolio"],
  ["/positions", "Positions"],
  ["/automations", "Automations"],
  ["/signal-monitor", "Signal Monitor"],
  ["/analytics", "Analytics"],
  ["/history", "History"],
  ["/connections", "Connections"],
] as const;

function money(value: unknown) {
  const parsed = Number(value ?? 0);
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(Number.isFinite(parsed) ? parsed : 0);
}
function ageLabel(ms: number | null | undefined) {
  if (ms == null) return "—";
  if (ms < 1500) return "just now";
  if (ms < 60_000) return `${Math.round(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`;
  return `${Math.round(ms / 86_400_000)}d ago`;
}
function readError(error: unknown, fallback: string) { return error instanceof Error ? error.message || fallback : fallback; }
function friendly(error: unknown) {
  const raw = readError(error, "Connection failed.");
  if (raw.includes("unsafe_permissions") || raw.includes("withdraw_permission") || raw.includes("transfer_permission") || raw.includes("binance_key_unsafe_permissions")) return "Use a Spot-trading API credential with withdrawals and transfers disabled.";
  if (raw.includes("spot_trade_permission_required") || raw.includes("binance_key_trading_disabled")) return "Enable Spot trading permission for this API credential and try again.";
  if (raw.includes("binance_key_reading_disabled")) return "Enable reading permission for this Binance API credential and try again.";
  if (raw.includes("binance_key_ip_restriction_required")) return "Restrict this Binance API credential to LabNarrative's trading IP, then try again.";
  if (raw.includes("invalid_credentials") || raw.includes("Invalid key") || raw.includes("-2015") || raw.toLowerCase().includes("invalid api-key")) return "The exchange rejected these credentials. Check the API key and secret and try again.";
  if (raw.includes("Invalid signature") || raw.includes("invalid_signature")) return "The exchange rejected the signature. Check that the key and secret belong to the same API credential.";
  if (raw.includes("invalid_passphrase") || raw.includes("passphrase_required")) return "Check the API passphrase and try again.";
  if (raw.includes("gateway_") || raw.includes("connection_control_timeout")) return "The secure exchange connection is temporarily unavailable. Please try again.";
  return raw.replaceAll("_", " ").slice(0, 220);
}

async function invokeRead() {
  const started = performance.now();
  const { data, error } = await browserSupabase.functions.invoke("trader-v2-connections-read", { body: {} });
  if (error) {
    let message = error.message || "trader-v2-connections-read_failed";
    const context = (error as { context?: Response }).context;
    if (context) {
      try { const body = await context.clone().json() as { error?: string }; if (body.error) message = body.error; } catch {}
    }
    throw new Error(message);
  }
  const payload = (data ?? {}) as ConnectionsReadResponse;
  if (payload.error || payload.ok !== true) throw new Error(payload.error || "trader-v2-connections-read_failed");
  return { payload, latencyMs: Math.round(performance.now() - started) };
}
async function invokeControl(body: Record<string, unknown>) {
  const { data, error } = await browserSupabase.functions.invoke("trader-v2-connections-control", { body });
  if (error) {
    let message = error.message || "connection_control_failed";
    const context = (error as { context?: Response }).context;
    if (context) {
      try { const responseBody = await context.clone().json() as { error?: string }; if (responseBody.error) message = responseBody.error; } catch {}
    }
    throw new Error(message);
  }
  const payload = (data ?? {}) as ControlResponse;
  if (payload.error || payload.ok !== true) throw new Error(payload.error || "connection_control_failed");
  return payload;
}

function AuthCard() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const send = async (event: FormEvent) => {
    event.preventDefault();
    const value = email.trim().toLowerCase();
    if (!value.includes("@")) return setError("Enter a valid email address.");
    setBusy(true); setError("");
    try {
      const { error: authError } = await browserSupabase.auth.signInWithOtp({ email: value, options: { shouldCreateUser: false } });
      if (authError) throw authError;
      setSent(true);
    } catch (caught) { setError(readError(caught, "Unable to send verification code.")); }
    finally { setBusy(false); }
  };
  const verify = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const { error: verifyError } = await browserSupabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.trim(), type: "email" });
      if (verifyError) throw verifyError;
    } catch (caught) { setError(readError(caught, "Unable to verify code.")); }
    finally { setBusy(false); }
  };
  return <main className={styles.auth}><section className={styles.authCard}>
    <div className={styles.brand}><span className={styles.mark} /><span className={styles.brandText}><strong>LabNarrative</strong><span>Trading</span></span></div>
    <h1>{sent ? "Verify your email" : "Sign in"}</h1>
    <p>{sent ? `Enter the verification code sent to ${email.trim().toLowerCase()}.` : "Access the new fast multi-exchange Trader workspace."}</p>
    <form className={styles.form} onSubmit={sent ? verify : send}>
      {!sent ? <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /></label> : <label>Verification code<input value={code} onChange={(event) => setCode(event.target.value)} inputMode="numeric" autoComplete="one-time-code" /></label>}
      {error && <div className={styles.error}>{error}</div>}
      <button className={styles.primaryButton} disabled={busy}>{busy ? "Please wait…" : sent ? "Continue" : "Send verification code"}</button>
      {sent && <button type="button" className={styles.ghostButton} onClick={() => { setSent(false); setCode(""); setError(""); }}>Use another email</button>}
    </form>
  </section></main>;
}

export default function ConnectionsApp() {
  const [authReady, setAuthReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [data, setData] = useState<ConnectionsReadResponse | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<LaunchProvider | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  const nav = useMemo(() => NAV, []);

  useEffect(() => {
    browserSupabase.auth.getSession().then(({ data: session }) => { setSignedIn(Boolean(session.session)); setAuthReady(true); });
    const { data: listener } = browserSupabase.auth.onAuthStateChange((_event, session) => { setSignedIn(Boolean(session)); setAuthReady(true); });
    return () => listener.subscription.unsubscribe();
  }, []);

  const load = useCallback(async () => {
    if (!signedIn) return;
    try {
      const result = await invokeRead();
      setData(result.payload); setLatencyMs(result.latencyMs); setError("");
    } catch (caught) { setError(friendly(caught)); }
    finally { setLoading(false); }
  }, [signedIn]);

  useEffect(() => {
    if (!signedIn) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    const refresh = async () => { if (!cancelled) await load(); };
    void refresh();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 15_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [signedIn, load]);

  const connectionMap = useMemo(() => {
    const map = new Map<LaunchProvider, Connection>();
    for (const connection of data?.connections ?? []) {
      const provider = connection.provider.toLowerCase() as LaunchProvider;
      if (PROVIDERS.some((item) => item.id === provider)) map.set(provider, connection);
    }
    return map;
  }, [data]);
  const launchConnected = PROVIDERS.filter((item) => connectionMap.get(item.id)?.status === "connected").length;
  const launchFresh = PROVIDERS.filter((item) => connectionMap.get(item.id)?.portfolioFresh === true).length;
  const current = selected ? connectionMap.get(selected) ?? null : null;
  const definition = selected ? PROVIDERS.find((item) => item.id === selected) ?? null : null;

  const resetSecrets = () => { setApiKey(""); setApiSecret(""); setPassphrase(""); };
  const open = (provider: LaunchProvider) => { setSelected(provider); resetSecrets(); setError(""); setNotice(""); };
  const close = () => { if (busy) return; setSelected(null); resetSecrets(); setError(""); };

  const connect = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected || busy) return;
    if (current?.status === "connected" && !window.confirm(`Replace the ${exchangeName(selected)} API credential after the new credential passes verification?`)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await invokeControl({ provider: selected, action: "connect", apiKey: apiKey.trim(), apiSecret: apiSecret.trim(), ...(definition?.passphrase ? { passphrase: passphrase.trim() } : {}) });
      resetSecrets();
      setNotice(`${exchangeName(selected)} connected and verified.`);
      setSelected(null);
      await load();
    } catch (caught) { setError(friendly(caught)); }
    finally { setBusy(false); }
  };

  const disconnect = async () => {
    if (!selected || busy) return;
    if (!window.confirm(`Disconnect ${exchangeName(selected)}? Existing history will stay intact, but live automation on this exchange cannot execute until it is reconnected.`)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await invokeControl({ provider: selected, action: "disconnect" });
      resetSecrets();
      setNotice(`${exchangeName(selected)} disconnected. Trading history was preserved.`);
      setSelected(null);
      await load();
    } catch (caught) { setError(friendly(caught)); }
    finally { setBusy(false); }
  };

  if (!authReady) return <div className={styles.loading}>Loading secure session…</div>;
  if (!signedIn) return <AuthCard />;

  const content = loading ? <div className={styles.loading}>Reading connection health…</div> : <>
    {error && !selected && <div className={styles.error}>{error}</div>}
    {notice && <div className={manage.notice}>{notice}</div>}
    <section className={styles.hero}><div className={styles.heroLabel}>Launch exchange connections</div><div className={styles.heroValue}>{launchConnected} / 4</div><div className={styles.heroMeta}><span>{launchFresh} portfolio feeds fresh</span><span>Credentials remain server-side</span>{latencyMs != null && <span>Read {latencyMs} ms</span>}</div></section>
    <div className={styles.cards}><section className={styles.card}><div className={styles.cardLabel}>Connected</div><div className={styles.cardValue}>{launchConnected}</div></section><section className={styles.card}><div className={styles.cardLabel}>Supported</div><div className={styles.cardValue}>4</div></section><section className={styles.card}><div className={styles.cardLabel}>Fresh balance feeds</div><div className={styles.cardValue}>{launchFresh}</div></section></div>
    <section className={styles.panel}><div className={styles.panelHeader}><h2>Exchange connections</h2><span>Read + Spot trading · withdrawals disabled</span></div><div className={manage.providerCards}>{PROVIDERS.map(({ id }) => {
      const connection = connectionMap.get(id);
      const connected = connection?.status === "connected";
      return <article className={manage.providerCard} key={id}>
        <div className={manage.providerCardHead}><div className={manage.providerIdentity}><ExchangeLogo provider={id} size={38} /><div><strong>{exchangeName(id)}</strong><span>{connected ? `${connection?.environment || "mainnet"} · key ••••${connection?.apiKeyLast4 || "—"}` : "Not connected"}</span></div></div><div className={manage.providerState}><span className={connected ? styles.badgeGood : styles.badgeNeutral}>{connected ? "Connected" : "Offline"}</span></div></div>
        <div className={manage.providerDetails}><div><span>Permissions</span><strong>{connected ? `Read ${connection?.permissionRead ? "✓" : "—"} · Trade ${connection?.permissionTrade ? "✓" : "—"} · Withdraw ${connection?.permissionWithdraw ? "✓" : "Off"}` : "—"}</strong></div><div><span>IP restriction</span><strong>{!connected || connection?.ipRestricted == null ? "—" : connection.ipRestricted ? "On" : "Off"}</strong></div><div><span>Verified</span><strong>{connected ? ageLabel(connection?.verificationAgeMs) : "—"}</strong></div><div><span>Portfolio feed</span><strong>{!connected ? "—" : connection?.portfolioFresh === true ? `Fresh · ${connection.portfolioAssetCount ?? 0} assets` : connection?.portfolioFresh === false ? "Using last good snapshot" : "Pending"}</strong></div>{connected && connection?.portfolioTotalUsd != null && <div><span>Current value</span><strong>{money(connection.portfolioTotalUsd)}</strong></div>}{connection?.lastError && <div><span>Last verification error</span><strong className={styles.negative}>{connection.lastError}</strong></div>}</div>
        <div className={manage.providerActions}><button className={manage.manageButton} onClick={() => open(id)}>{connected ? "Manage" : "Connect"}</button></div>
      </article>;
    })}</div><p className={manage.securityNote}>API secrets and passphrases are never returned to this page. New credentials are verified by the existing server-side exchange workflow before the connection is marked connected.</p></section>
  </>;

  return <div className={styles.page}>
    <aside className={styles.sidebar}><Link href="/" className={styles.brand}><span className={styles.mark} /><span className={styles.brandText}><strong>LabNarrative</strong><span>Trading</span></span></Link><nav className={styles.nav}>{nav.map(([href, label]) => <Link href={href} key={href} className={href === "/connections" ? styles.active : undefined}>{label}</Link>)}</nav><div className={styles.legacy}><a href="https://platform.labnarrative.com/trader">Open current Trader</a></div></aside>
    <main className={styles.main}><header className={styles.topbar}><div><div className={styles.eyebrow}>Core V2</div><h1 className={styles.title}>Connections</h1></div><div className={styles.topActions}><div className={styles.status}><span className={launchConnected === 4 ? styles.dot : `${styles.dot} ${styles.dotWarn}`} />{launchConnected} connected</div><button className={styles.ghostButton} onClick={() => browserSupabase.auth.signOut()}>Sign out</button></div></header>{content}</main>

    {selected && <div className={manage.backdrop} onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><section className={manage.modal} role="dialog" aria-modal="true" aria-label={`Manage ${exchangeName(selected)}`}>
      <div className={manage.modalHead}><div className={manage.modalIdentity}><ExchangeLogo provider={selected} size={42} /><div><small>{current?.status === "connected" ? "EXCHANGE CONNECTED" : "CONNECT EXCHANGE"}</small><h2>{exchangeName(selected)}</h2></div></div><button className={manage.closeButton} onClick={close} aria-label="Close">×</button></div>
      {current?.status === "connected" && <div className={manage.connectedBox}><span>✓</span><div><strong>Connected</strong><small>{current.apiKeyLast4 ? `API key ••••${current.apiKeyLast4}` : "Verified server-side credential"}</small></div></div>}
      {error && <div className={styles.error}>{error}</div>}
      <form className={manage.form} onSubmit={connect}>
        <label><span>API Key</span><input value={apiKey} onChange={(event) => setApiKey(event.target.value)} autoComplete="off" spellCheck={false} placeholder="Paste API key" required /></label>
        <label><span>API Secret</span><input type="password" value={apiSecret} onChange={(event) => setApiSecret(event.target.value)} autoComplete="new-password" spellCheck={false} placeholder="Paste API secret" required /></label>
        {definition?.passphrase && <label><span>API Passphrase</span><input type="password" value={passphrase} onChange={(event) => setPassphrase(event.target.value)} autoComplete="new-password" spellCheck={false} placeholder="Paste API passphrase" required /></label>}
        <div className={manage.modalHelp}>{current?.status === "connected" ? "Submitting new credentials replaces the stored credential only after the exchange verification succeeds." : "Use an API credential with reading and Spot trading enabled. Withdrawal permission is never required and unsafe permissions are rejected."}</div>
        <div className={manage.modalActions}>{current?.status === "connected" && <button type="button" className={manage.dangerButton} onClick={() => void disconnect()} disabled={busy}>Disconnect</button>}<button type="button" className={manage.secondaryButton} onClick={close} disabled={busy}>Cancel</button><button className={manage.primaryButton} disabled={busy}>{busy ? "Verifying…" : current?.status === "connected" ? "Replace connection" : "Connect"}</button></div>
      </form>
    </section></div>}
  </div>;
}
