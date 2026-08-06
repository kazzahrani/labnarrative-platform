import fs from "node:fs";

const pageUrl = new URL("../app/admin/automation/page.tsx", import.meta.url);
let source = fs.readFileSync(pageUrl, "utf8");

function replaceRequired(current, oldText, newText, label) {
  if (current.includes(newText)) return current;
  if (!current.includes(oldText)) {
    throw new Error(`${label} insertion point was not found.`);
  }
  return current.replace(oldText, newText);
}

source = replaceRequired(
  source,
  "  const pollLock = useRef(false);\n",
  "  const pollLock = useRef(false);\n  const sessionRef = useRef<Session | null>(null);\n",
  "Production session reference",
);

source = replaceRequired(
  source,
  "    const currentSession = activeSession ?? session;",
  "    const currentSession = activeSession ?? sessionRef.current;",
  "Production session lookup",
);

source = replaceRequired(
  source,
  'supabase.from("production_runs").select("*,prospects(*),sites(id,slug,status,domain_status,domain_url,content)").order("created_at", { ascending: false })',
  'supabase.from("production_runs").select("*,prospects(*),sites(id,slug,status,domain_status,domain_url)").order("created_at", { ascending: false })',
  "Production run payload reduction",
);

source = replaceRequired(
  source,
  'supabase.from("pipeline_events").select("*").order("created_at", { ascending: false }).limit(120)',
  'supabase.from("pipeline_events").select("id,prospect_id,production_run_id,event_type,step,message,created_at").order("created_at", { ascending: false }).limit(60)',
  "Production event payload reduction",
);

source = replaceRequired(
  source,
  `  }, [session]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
      if (data.session) void loadData(data.session);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthReady(true);
      if (nextSession) void loadData(nextSession);
      else {
        setRole(null);
        setProspects([]);
        setRuns([]);
      }
    });
    return () => subscription.unsubscribe();
  }, [loadData]);

  useEffect(() => {
    if (!session || role !== "admin") return;
    const timer = window.setInterval(() => void loadData(), 30_000);
    return () => window.clearInterval(timer);
  }, [loadData, role, session]);`,
  `  }, []);

  useEffect(() => {
    let cancelled = false;

    const applySession = (nextSession: Session | null) => {
      if (cancelled) return;

      const previousUserId = sessionRef.current?.user.id ?? "";
      const nextUserId = nextSession?.user.id ?? "";
      sessionRef.current = nextSession;
      setSession(nextSession);
      setAuthReady(true);

      if (nextSession && nextUserId !== previousUserId) {
        void loadData(nextSession);
      } else if (!nextSession) {
        setRole(null);
        setProspects([]);
        setRuns([]);
        setMessages([]);
        setEvents([]);
      }
    };

    void supabase.auth.getSession().then(({ data }) => applySession(data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      applySession(nextSession);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [loadData]);`,
  "Production authentication and polling optimization",
);

for (const required of [
  "const sessionRef = useRef<Session | null>(null);",
  "activeSession ?? sessionRef.current",
  "sites(id,slug,status,domain_status,domain_url)",
  ".limit(60)",
  "const applySession = (nextSession: Session | null)",
]) {
  if (!source.includes(required)) {
    throw new Error(`Production performance marker missing: ${required}`);
  }
}

if (source.includes("window.setInterval(() => void loadData(), 30_000)")) {
  throw new Error("The Production background polling loop is still present.");
}
if (source.includes("sites(id,slug,status,domain_status,domain_url,content)")) {
  throw new Error("Full site content is still included in Production loading.");
}

fs.writeFileSync(pageUrl, source);
console.log("Production loading stabilized; duplicate auth loads, full site content and background polling removed.");
