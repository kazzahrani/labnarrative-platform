import fs from "node:fs";

const path = "app/trader/TraderV2FullShell.tsx";
const source = fs.readFileSync(path, "utf8");

const before = `  useEffect(() => {
    let active = true;
    void browserSupabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      const hasSession = Boolean(data.session);
      setSignedIn(hasSession); setAuthReady(true);
      if (hasSession) { sessionBootstrapped.current = true; void loadAccounts(true); }
    });
    const { data: listener } = browserSupabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      const hasSession = Boolean(session);
      setSignedIn(hasSession); setAuthReady(true);
      if (hasSession) {
        if (!sessionBootstrapped.current) { sessionBootstrapped.current = true; void loadAccounts(true); }
      } else {
        sessionBootstrapped.current = false;
        setAccounts([]); setWorkspace(null); setAccountsReady(false); setSelectedKind("real");
        setBalances([]); setQuoteBalance(null); setTotalUsd(null);
      }
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);
`;

const after = `  useEffect(() => {
    let active = true;
    void browserSupabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      const hasSession = Boolean(data.session);
      setSignedIn(hasSession); setAuthReady(true);
      if (!hasSession) {
        sessionBootstrapped.current = false;
        setAccounts([]); setWorkspace(null); setAccountsReady(false); setSelectedKind("real");
        setBalances([]); setQuoteBalance(null); setTotalUsd(null);
      }
    });
    const { data: listener } = browserSupabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      const hasSession = Boolean(session);
      setSignedIn(hasSession); setAuthReady(true);
      // IMPORTANT: never invoke Supabase network methods from inside this callback.
      // Supabase Auth holds its internal auth lock while onAuthStateChange runs.
      if (!hasSession) {
        sessionBootstrapped.current = false;
        setAccounts([]); setWorkspace(null); setAccountsReady(false); setSelectedKind("real");
        setBalances([]); setQuoteBalance(null); setTotalUsd(null);
      }
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);
  useEffect(() => {
    if (!authReady || !signedIn || sessionBootstrapped.current) return;
    sessionBootstrapped.current = true;
    void loadAccounts(true);
  }, [authReady, signedIn]);
`;

if (!source.includes(before)) {
  if (source.includes("IMPORTANT: never invoke Supabase network methods from inside this callback.")) {
    console.log("Trader auth bootstrap deadlock fix already applied.");
    process.exit(0);
  }
  throw new Error("Trader auth bootstrap anchor not found; refusing to patch an unknown shell shape.");
}

const next = source.replace(before, after);
fs.writeFileSync(path, next);
console.log("Prepared Trader auth bootstrap outside Supabase onAuthStateChange lock.");
