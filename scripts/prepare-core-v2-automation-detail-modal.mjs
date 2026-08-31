import fs from "node:fs";

const file = "app/trader-v2/AutomationsApp.tsx";
let source = fs.readFileSync(file, "utf8");

if (!source.includes('import AutomationDetailModal from "./AutomationDetailModal";')) {
  source = source.replace('import styles from "./automations-app.module.css";','import styles from "./automations-app.module.css";\nimport AutomationDetailModal from "./AutomationDetailModal";');
}

if (!source.includes("allPairs?: boolean;")) {
  source = source.replace("  conditionLabel: string;\n", "  conditionLabel: string;\n  allPairs?: boolean;\n  pairs?: string[];\n  conditions?: Array<{ id?: string | number; kind?: string; length?: number; comparator?: string; signal?: number; timeframe?: string; aux1?: number; aux2?: number; aux3?: number }>;\n  wins?: number;\n  losses?: number;\n  breakeven?: number;\n  realizedRoi?: number;\n  stopLossTimeoutSeconds?: number | null;\n");
}

if (!source.includes("  allPairs: boolean;\n  conditions:")) {
  source = source.replace(
`type BotForm = {\n  name: string;\n  provider: string;\n  pair: string;\n  baseOrder: number;`,
`type BotForm = {\n  name: string;\n  provider: string;\n  pair: string;\n  pairs: string[];\n  allPairs: boolean;\n  conditions: Array<{ id?: string | number; kind?: string; length?: number; comparator?: string; signal?: number; timeframe?: string; aux1?: number; aux2?: number; aux3?: number }>;\n  baseOrder: number;`
  );
  source = source.replace(
`  takeProfit: number;\n  stopEnabled: boolean;\n  stopPct: number;`,
`  takeProfit: number;\n  trailingPct: number;\n  stopEnabled: boolean;\n  stopPct: number;\n  stopLossTimeoutSeconds: number;`
  );
}

if (!source.includes('pairs: ["BTC/USDT"]')) {
  source = source.replace(
`  pair: "BTC/USDT",\n  baseOrder: 20,`,
`  pair: "BTC/USDT",\n  pairs: ["BTC/USDT"],\n  allPairs: false,\n  conditions: [],\n  baseOrder: 20,`
  );
  source = source.replace(
`  takeProfit: 1.5,\n  stopEnabled: false,\n  stopPct: 8,`,
`  takeProfit: 1.5,\n  trailingPct: 0,\n  stopEnabled: false,\n  stopPct: 8,\n  stopLossTimeoutSeconds: 0,`
  );
}

if (!source.includes("pairs: automation.pairs?.length")) {
  source = source.replace(
`    pair: automation.pair || "BTC/USDT",\n    baseOrder: automation.baseOrder ?? 20,`,
`    pair: automation.pair || "BTC/USDT",\n    pairs: automation.pairs?.length ? [...automation.pairs] : [automation.pair || "BTC/USDT"],\n    allPairs: automation.allPairs === true,\n    conditions: (automation.conditions ?? []).map((condition) => ({ ...condition })),\n    baseOrder: automation.baseOrder ?? 20,`
  );
  source = source.replace(
`    takeProfit: automation.takeProfitPct ?? 1.5,\n    stopEnabled: automation.stopEnabled,\n    stopPct: automation.stopPct ?? 8,`,
`    takeProfit: automation.takeProfitPct ?? 1.5,\n    trailingPct: automation.trailingPct ?? 0,\n    stopEnabled: automation.stopEnabled,\n    stopPct: automation.stopPct ?? 8,\n    stopLossTimeoutSeconds: automation.stopLossTimeoutSeconds ?? 0,`
  );
}

if (!source.includes("selectedAutomationId")) {
  source = source.replace('  const [filter, setFilter] = useState<FilterValue>("all");', '  const [filter, setFilter] = useState<FilterValue>("all");\n  const [selectedAutomationId, setSelectedAutomationId] = useState<string | null>(null);\n  const [automationModalMode, setAutomationModalMode] = useState<"view" | "edit" | null>(null);');
}

if (!source.includes("const selectedAutomation =")) {
  source = source.replace("  const editing = editingId ? automations.find((automation) => automation.id === editingId) ?? null : null;", "  const editing = editingId ? automations.find((automation) => automation.id === editingId) ?? null : null;\n  const selectedAutomation = selectedAutomationId ? automations.find((automation) => automation.id === selectedAutomationId) ?? null : null;");
}

source = source.replace(
`  const openEdit = (automation: Automation) => {\n    if (!automation.canManage || automation.type !== "DCA") return;\n    setBotForm(formFromAutomation(automation)); setEditingId(automation.id); setEditorMode("edit"); setError(""); setNotice("");\n  };`,
`  const openDetail = (automation: Automation) => {\n    setSelectedAutomationId(automation.id); setAutomationModalMode("view"); setError(""); setNotice("");\n  };\n  const openEdit = (automation: Automation) => {\n    if (!automation.canManage || automation.type !== "DCA") return;\n    setBotForm(formFromAutomation(automation)); setEditingId(automation.id); setEditorMode("edit"); setSelectedAutomationId(automation.id); setAutomationModalMode("edit"); setError(""); setNotice("");\n  };`
);

source = source.replace(
'  const closeEditor = () => { if (!busy) { setEditorMode(null); setEditingId(null); } };',
'  const closeEditor = () => { if (!busy) { setEditorMode(null); setEditingId(null); setAutomationModalMode(null); setSelectedAutomationId(null); } };'
);

if (!source.includes("allPairs: botForm.allPairs")) {
  source = source.replace(
`        provider: botForm.provider,\n        name: botForm.name.trim(), pair: botForm.pair.trim().toUpperCase(),\n        baseOrder: botForm.baseOrder, safetyOrder: botForm.safetyOrder,`,
`        provider: botForm.provider,\n        name: botForm.name.trim(), pair: botForm.pair.trim().toUpperCase(),\n        pairs: botForm.pairs, allPairs: botForm.allPairs, conditions: botForm.conditions,\n        baseOrder: botForm.baseOrder, safetyOrder: botForm.safetyOrder,`
  );
  source = source.replace(
`        takeProfit: botForm.takeProfit, stopEnabled: botForm.stopEnabled, stopPct: botForm.stopPct,`,
`        takeProfit: botForm.takeProfit, trailingPct: botForm.trailingPct, stopEnabled: botForm.stopEnabled, stopPct: botForm.stopPct, stopLossTimeoutSeconds: botForm.stopLossTimeoutSeconds,`
  );
}

source = source.replace(
'      setEditorMode(null); setEditingId(null); await load(true);',
'      setEditorMode(null); setEditingId(null); setAutomationModalMode(null); setSelectedAutomationId(null); await load(true);'
);

source = source.replace("    {editor}\n", "    {editorMode === \"create\" ? editor : null}\n");
source = source.replace(
'return <tr key={automation.id} className={automation.canManage ? styles.clickableRow : undefined} onClick={() => openEdit(automation)}>',
'return <tr key={automation.id} className={styles.clickableRow} onClick={() => openDetail(automation)}>'
);

if (!source.includes("<AutomationDetailModal")) {
  source = source.replace(
'    <main className={`${base.main} ${styles.main}`}><header className={`${base.topbar} ${styles.topbar}`}><div><div className={base.eyebrow}>AUTOMATIONS</div><h1 className={base.title}>Automations</h1></div><div className={styles.headingActions}><button className={styles.newButton} type="button" onClick={openCreate} disabled={busy}>＋ New Automation</button><button className={styles.signOut} type="button" onClick={() => browserSupabase.auth.signOut()}>Sign out</button></div></header>{content}</main>\n  </div>;',
'    <main className={`${base.main} ${styles.main}`}><header className={`${base.topbar} ${styles.topbar}`}><div><div className={base.eyebrow}>AUTOMATIONS</div><h1 className={base.title}>Automations</h1></div><div className={styles.headingActions}><button className={styles.newButton} type="button" onClick={openCreate} disabled={busy}>＋ New Automation</button><button className={styles.signOut} type="button" onClick={() => browserSupabase.auth.signOut()}>Sign out</button></div></header>{content}</main>\n    {selectedAutomation && automationModalMode && <AutomationDetailModal automation={selectedAutomation} mode={automationModalMode} form={botForm} busy={busy} onClose={closeEditor} onEdit={() => openEdit(selectedAutomation)} onToggle={() => void toggleAutomation(selectedAutomation)} onArchive={() => void archiveAutomation(selectedAutomation)} onFormChange={(patch) => setBotForm((current) => ({ ...current, ...patch }))} onSave={saveBot} />}\n  </div>;'
  );
}

fs.writeFileSync(file, source);
console.log("Prepared Core V2 automation detail/edit modal.");
