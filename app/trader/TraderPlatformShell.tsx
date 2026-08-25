"use client";

import { FormEvent, MouseEvent as ReactMouseEvent, useEffect, useMemo, useRef, useState } from "react";
import { browserSupabase } from "../../lib/supabase-browser";
import BinanceConnectionLayer from "./BinanceConnectionLayer";
import TradingAgent from "./TradingAgent";
import styles from "./trader-platform-shell.module.css";

type AccountKind = "paper" | "real";
type TraderAccount = {
  id: string;
  name: string;
  kind: AccountKind;
  mode: "paper" | "shadow" | "live";
  status: string;
  quoteAsset: string;
  startingBalance: number;
  exchangeStatus: string;
  apiKeyLast4: string | null;
};

type AccountControlResponse = {
  ok?: boolean;
  accounts?: TraderAccount[];
  realAccountId?: string;
  error?: string;
};

type AuthMode = "login" | "signup";

async function invokeAccountControl(action: "bootstrap" | "list" | "create_real") {
  const { data, error } = await browserSupabase.functions.invoke("trader-account-control", { body: { action } });
  if (error) {
    let message = error.message || "trader_account_control_failed";
    const context = (error as { context?: Response }).context;
    if (context) {
      try {
        const payload = await context.clone().json() as { error?: string };
        if (payload.error) message = payload.error;
      } catch {}
    }
    throw new Error(message);
  }
  const result = (data ?? {}) as AccountControlResponse;
  if (result.error || result.ok !== true) throw new Error(result.error || "trader_account_control_failed");
  return result;
}

function TraderAuth() {
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const sendCode = async (event: FormEvent) => {
    event.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      setError("Enter a valid email address.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { error: authError } = await browserSupabase.auth.signInWithOtp({
        email: cleanEmail,
        options: { shouldCreateUser: mode === "signup" },
      });
      if (authError) throw authError;
      setOtpSent(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to send verification code.");
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async (event: FormEvent) => {
    event.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    const token = otp.trim();
    if (!token) {
      setError("Enter the verification code from your email.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { data, error: verifyError } = await browserSupabase.auth.verifyOtp({
        email: cleanEmail,
        token,
        type: "email",
      });
      if (verifyError) throw verifyError;
      if (!data.session) throw new Error("Sign in did not create a secure session.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to verify code.");
    } finally {
      setBusy(false);
    }
  };

  return <div className={styles.authPage}>
    <section className={styles.authCard}>
      <div className={styles.brand}><span className={styles.brandMark}>LN</span><strong>LabNarrative Trading</strong></div>
      <span className={styles.kicker}>TRADING AUTOMATION</span>
      <h1>{otpSent ? "Verify your email" : mode === "login" ? "Welcome back" : "Create your account"}</h1>
      <p>{otpSent ? `We sent a one-time code to ${email.trim().toLowerCase()}.` : "Sign in before accessing paper or real trading accounts."}</p>

      {!otpSent && <div className={styles.tabs}>
        <button type="button" className={mode === "login" ? styles.activeTab : ""} onClick={() => { setMode("login"); setError(""); }}>Log in</button>
        <button type="button" className={mode === "signup" ? styles.activeTab : ""} onClick={() => { setMode("signup"); setError(""); }}>Sign up</button>
      </div>}

      {otpSent ? <form className={styles.authForm} onSubmit={verifyCode}>
        <label><span>Verification code</span><input value={otp} onChange={(event) => setOtp(event.target.value)} inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code" disabled={busy} /></label>
        {error && <div className={styles.error}>{error}</div>}
        <div className={styles.formActions}>
          <button type="button" className={styles.secondary} onClick={() => { setOtpSent(false); setOtp(""); setError(""); }} disabled={busy}>Back</button>
          <button type="submit" className={styles.primary} disabled={busy}>{busy ? "Verifying…" : "Verify & continue"}</button>
        </div>
      </form> : <form className={styles.authForm} onSubmit={sendCode}>
        <label><span>Email</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="you@example.com" disabled={busy} /></label>
        <p>{mode === "signup" ? "A paper account will be created automatically. Real trading remains disabled until you explicitly create a Real Account and connect an exchange." : "We use a one-time email code — no password is stored by the trading interface."}</p>
        {error && <div className={styles.error}>{error}</div>}
        <button type="submit" className={styles.primary} disabled={busy}>{busy ? "Sending…" : "Send verification code"}</button>
      </form>}
    </section>
  </div>;
}

export default function TraderPlatformShell() {
  const [authReady, setAuthReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [accounts, setAccounts] = useState<TraderAccount[]>([]);
  const [accountsReady, setAccountsReady] = useState(false);
  const [accountError, setAccountError] = useState("");
  const [selectedKind, setSelectedKind] = useState<AccountKind>("paper");
  const [accountModal, setAccountModal] = useState(false);
  const [creatingReal, setCreatingReal] = useState(false);
  const paperRoot = useRef<HTMLDivElement>(null);

  const paperAccount = useMemo(() => accounts.find((account) => account.kind === "paper") ?? null, [accounts]);
  const realAccount = useMemo(() => accounts.find((account) => account.kind === "real") ?? null, [accounts]);

  const loadAccounts = async (action: "bootstrap" | "list" = "list") => {
    try {
      const result = await invokeAccountControl(action);
      const nextAccounts = result.accounts ?? [];
      setAccounts(nextAccounts);
      setAccountError("");
      const saved = typeof window !== "undefined" ? sessionStorage.getItem("ln-trader-account-kind") : null;
      if (saved === "real" && nextAccounts.some((account) => account.kind === "real")) setSelectedKind("real");
      else if (!nextAccounts.some((account) => account.kind === selectedKind)) setSelectedKind("paper");
    } catch (caught) {
      setAccountError(caught instanceof Error ? caught.message : "Unable to load trading accounts.");
    } finally {
      setAccountsReady(true);
    }
  };

  useEffect(() => {
    let active = true;
    void browserSupabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      const hasSession = Boolean(data.session);
      setSignedIn(hasSession);
      setAuthReady(true);
      if (hasSession) void loadAccounts("bootstrap");
      else setAccountsReady(false);
    });
    const { data: listener } = browserSupabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      const hasSession = Boolean(session);
      setSignedIn(hasSession);
      setAuthReady(true);
      if (hasSession) {
        setAccountsReady(false);
        void loadAccounts("bootstrap");
      } else {
        setAccounts([]);
        setAccountsReady(false);
        setSelectedKind("paper");
      }
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!signedIn || selectedKind !== "real") return;
    const timer = window.setInterval(() => { void loadAccounts("list"); }, 5000);
    return () => window.clearInterval(timer);
  }, [signedIn, selectedKind]);

  useEffect(() => {
    if (selectedKind !== "paper" || !paperRoot.current) return;
    const root = paperRoot.current;
    const cleanPaperActions = () => {
      root.querySelectorAll("button").forEach((button) => {
        const label = (button.textContent ?? "").replace(/\s+/g, " ").trim().toLowerCase();
        const sectionText = (button.closest("section")?.textContent ?? "").toLowerCase();
        const hide = label === "connect binance" || label === "connect a new account" || (label === "connect" && sectionText.includes("exchange"));
        if (hide) button.style.display = "none";
      });
      root.querySelectorAll("div").forEach((element) => {
        const first = element.firstElementChild?.textContent?.trim().toUpperCase();
        if (first === "PAPER ACCOUNT") {
          (element as HTMLElement).dataset.traderAccountSwitch = "true";
          (element as HTMLElement).style.cursor = "pointer";
        }
      });
    };
    cleanPaperActions();
    const observer = new MutationObserver(cleanPaperActions);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [selectedKind]);

  const paperClickCapture = (event: ReactMouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    const button = target.closest("button");
    const label = (button?.textContent ?? "").replace(/\s+/g, " ").trim().toLowerCase();
    const accountSummary = target.closest('[data-trader-account-switch="true"]');
    if (label === "switch to real account" || accountSummary) {
      event.preventDefault();
      event.stopPropagation();
      setAccountModal(true);
    }
  };

  const selectAccount = (kind: AccountKind) => {
    if (kind === "real" && !realAccount) return;
    setSelectedKind(kind);
    sessionStorage.setItem("ln-trader-account-kind", kind);
    setAccountModal(false);
  };

  const createRealAccount = async () => {
    if (creatingReal) return;
    setCreatingReal(true);
    setAccountError("");
    try {
      const result = await invokeAccountControl("create_real");
      setAccounts(result.accounts ?? []);
      setSelectedKind("real");
      sessionStorage.setItem("ln-trader-account-kind", "real");
      setAccountModal(false);
    } catch (caught) {
      setAccountError(caught instanceof Error ? caught.message : "Unable to create Real Account.");
    } finally {
      setCreatingReal(false);
    }
  };

  const signOut = async () => {
    await browserSupabase.auth.signOut();
    sessionStorage.removeItem("ln-trader-account-kind");
    setAccountModal(false);
  };

  if (!authReady) return <div className={styles.loading}>Checking secure session…</div>;
  if (!signedIn) return <TraderAuth />;
  if (!accountsReady) return <div className={styles.loading}>Loading your trading accounts…</div>;

  const accountChooser = accountModal ? <div className={styles.backdrop} onMouseDown={(event) => { if (event.target === event.currentTarget) setAccountModal(false); }}>
    <section className={styles.accountModal} role="dialog" aria-modal="true" aria-labelledby="account-switch-title">
      <div className={styles.modalHead}>
        <div><span className={styles.kicker}>TRADING ACCOUNTS</span><h2 id="account-switch-title">Choose account</h2></div>
        <button type="button" className={styles.close} onClick={() => setAccountModal(false)} aria-label="Close">×</button>
      </div>
      <div className={styles.accountList}>
        <button type="button" className={`${styles.accountRow} ${selectedKind === "paper" ? styles.accountRowActive : ""}`} onClick={() => selectAccount("paper")}>
          <span className={styles.accountIcon}>P</span><span><strong>{paperAccount?.name ?? "Paper Account"}</strong><p>Simulation account · no exchange credentials · no real orders</p></span><span className={styles.accountStatus}>{selectedKind === "paper" ? "ACTIVE" : "OPEN"}</span>
        </button>
        {realAccount ? <button type="button" className={`${styles.accountRow} ${selectedKind === "real" ? styles.accountRowActive : ""}`} onClick={() => selectAccount("real")}>
          <span className={styles.accountIcon}>R</span><span><strong>Real Account</strong><p>{realAccount.exchangeStatus === "connected" ? `Binance connected${realAccount.apiKeyLast4 ? ` · key ••••${realAccount.apiKeyLast4}` : ""}` : "Exchange account · Binance can be connected here only"}</p></span><span className={styles.accountStatus}>{realAccount.exchangeStatus === "connected" ? "CONNECTED" : selectedKind === "real" ? "ACTIVE" : "OPEN"}</span>
        </button> : <button type="button" className={styles.accountRow} onClick={() => void createRealAccount()} disabled={creatingReal}>
          <span className={styles.accountIcon}>R</span><span><strong>Real Account</strong><p>Create a separate real-money workspace. Live execution stays OFF.</p></span><span className={styles.accountStatus}>{creatingReal ? "CREATING…" : "CREATE"}</span>
        </button>}
        {accountError && <div className={styles.error}>{accountError}</div>}
      </div>
      <div className={styles.modalFoot}><span>Paper and Real accounts never share balances or orders.</span><button type="button" className={styles.signOut} onClick={() => void signOut()}>Sign out</button></div>
    </section>
  </div> : null;

  if (selectedKind === "paper") {
    return <div className={styles.shell}>
      <div className={styles.paperWrap} ref={paperRoot} onClickCapture={paperClickCapture}>
        <TradingAgent />
        <button type="button" className={styles.accountPill} onClick={() => setAccountModal(true)}><span>Paper Account</span><small>SIMULATION</small><i>⌄</i></button>
      </div>
      {accountChooser}
    </div>;
  }

  const connected = realAccount?.exchangeStatus === "connected";
  return <div className={styles.shell}>
    <div className={styles.realPage}>
      <header className={styles.realHeader}>
        <div className={styles.brand}><span className={styles.brandMark}>LN</span><strong>LabNarrative</strong></div>
        <div className={styles.modeBadge}><span>REAL ACCOUNT</span><strong>{connected ? "Binance connected" : "Not connected"}</strong></div>
        <div className={styles.realHeaderSpacer}/>
        <button type="button" className={styles.accountPill} style={{ position: "static" }} onClick={() => setAccountModal(true)}><span>Real Account</span><small>{connected ? "CONNECTED" : "SETUP"}</small><i>⌄</i></button>
      </header>
      <main className={styles.realMain}>
        <div className={styles.realTitle}><span className={styles.kicker}>REAL-MONEY WORKSPACE</span><h1>Real Account</h1><p>This account is isolated from your Paper Account. Connect Binance here to verify balances and prepare shadow/live execution. Connecting the exchange alone never enables real orders.</p></div>
        <div className={styles.realGrid}>
          <section className={styles.realCard}>
            <div className={styles.realCardHead}><span className={styles.exchangeLogo}>◆</span><div><h2>Binance Spot</h2><p>Static-IP secured exchange connection</p></div><span className={`${styles.connectionBadge} ${connected ? styles.connectedBadge : ""}`}>{connected ? "Connected" : "Not connected"}</span></div>
            <div className={styles.realCardBody}>
              <p>{connected ? `API verification is complete${realAccount?.apiKeyLast4 ? ` for key ending in ${realAccount.apiKeyLast4}` : ""}. Live execution is still disabled.` : "Connect the Binance API key that is restricted to the LabNarrative gateway IP. Credentials are verified server-side and stored in Supabase Vault."}</p>
              {!connected && <button type="button" className={`${styles.primary} ${styles.connectButton}`}>Connect Binance</button>}
            </div>
          </section>
          <aside className={styles.safetyCard}>
            <h3>Execution safety</h3>
            <div className={styles.safetyLine}><span>Account mode</span><strong>Real / Shadow</strong></div>
            <div className={styles.safetyLine}><span>Live execution</span><strong className={styles.safe}>OFF</strong></div>
            <div className={styles.safetyLine}><span>Kill switch</span><strong className={styles.safe}>ON</strong></div>
            <div className={styles.safetyLine}><span>Withdrawals</span><strong className={styles.safe}>BLOCKED</strong></div>
          </aside>
        </div>
        <div className={styles.realNotice}>Your Paper Account remains unchanged, including its bots, trades and historical balance. We are switching workspaces — not converting or deleting the paper account.</div>
      </main>
    </div>
    <BinanceConnectionLayer />
    {accountChooser}
  </div>;
}
