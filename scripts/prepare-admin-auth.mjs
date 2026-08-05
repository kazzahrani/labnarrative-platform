import fs from "node:fs";
import path from "node:path";

const filePath = path.join(process.cwd(), "app", "admin", "automation", "page.tsx");
let source = fs.readFileSync(filePath, "utf8");

function replaceOnce(oldText, newText, label) {
  if (source.includes(newText)) return;
  const index = source.indexOf(oldText);
  if (index === -1) {
    throw new Error(`Could not prepare admin authentication: ${label} pattern was not found.`);
  }
  source = source.slice(0, index) + newText + source.slice(index + oldText.length);
}

replaceOnce(
  "  const pollLock = useRef(false);\n",
  "  const pollLock = useRef(false);\n  const sessionRef = useRef<Session | null>(null);\n",
  "session reference",
);

replaceOnce(
  "    const currentSession = activeSession ?? session;\n",
  "    const currentSession = activeSession ?? sessionRef.current;\n",
  "stable session lookup",
);

replaceOnce(
  "      pollLock.current = false;\n    }\n  }, [session]);\n",
  "      pollLock.current = false;\n    }\n  }, []);\n",
  "stable load callback",
);

replaceOnce(
  "    supabase.auth.getSession().then(({ data }) => {\n      setSession(data.session);\n",
  "    supabase.auth.getSession().then(({ data }) => {\n      sessionRef.current = data.session;\n      setSession(data.session);\n",
  "initial session reference",
);

replaceOnce(
  "    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {\n      setSession(nextSession);\n",
  "    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {\n      sessionRef.current = nextSession;\n      setSession(nextSession);\n",
  "auth change session reference",
);

fs.writeFileSync(filePath, source);
console.log("Admin authentication session handling prepared.");
