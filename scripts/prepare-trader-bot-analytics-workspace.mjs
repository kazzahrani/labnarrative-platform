import fs from "node:fs";
import path from "node:path";

const target = path.join(process.cwd(), "app", "trader", "Analytics.tsx");
if (!fs.existsSync(target)) throw new Error("Bot analytics workspace target missing");
let source = fs.readFileSync(target, "utf8");

function replaceOnce(from, to, label) {
  if (!source.includes(from)) throw new Error(`Bot analytics workspace missing ${label}`);
  source = source.replace(from, to);
}

if (!source.includes('import BotAnalyticsWorkspace from "./BotAnalyticsWorkspace";')) {
  replaceOnce(
    'import styles from "./analytics.module.css";',
    'import styles from "./analytics.module.css";\nimport BotAnalyticsWorkspace from "./BotAnalyticsWorkspace";',
    "import anchor",
  );
}

replaceOnce(
  '  const [selectedId, setSelectedId] = useState("all");',
  '  const [selectedId, setSelectedId] = useState("all");\n  const [workspaceId, setWorkspaceId] = useState<string | null>(null);',
  "workspace state",
);

source = source.replaceAll(
  'onClick={() => setSelectedId(item.id)}',
  'onClick={() => { setSelectedId(item.id); setWorkspaceId(item.id); }}',
);

replaceOnce(
  '      </section>\n    </>}\n  </div>;\n}',
  '      </section>\n    </>}\n    {workspaceId && automations.find((item) => item.id === workspaceId) && <BotAnalyticsWorkspace accountId={accountId} accountName={accountName} range={range} automation={automations.find((item) => item.id === workspaceId)!} automations={automations} onClose={() => setWorkspaceId(null)} onRangeChange={setRange} />}\n  </div>;\n}',
  "workspace render",
);

for (const marker of [
  'import BotAnalyticsWorkspace from "./BotAnalyticsWorkspace";',
  'const [workspaceId, setWorkspaceId]',
  '<BotAnalyticsWorkspace accountId={accountId}',
]) if (!source.includes(marker)) throw new Error(`Bot analytics workspace output missing ${marker}`);

fs.writeFileSync(target, source);
console.log("Prepared interactive bot-specific Analytics workspace.");
