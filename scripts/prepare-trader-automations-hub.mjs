import fs from "node:fs";
import path from "node:path";

const shellPath = path.join(process.cwd(), "app", "trader", "TraderV2FullShell.tsx");
if (!fs.existsSync(shellPath)) throw new Error(`Automations hub target not found: ${shellPath}`);

let source = fs.readFileSync(shellPath, "utf8");
let changes = 0;

const replaceOnce = (from, to, label) => {
  if (!source.includes(from)) throw new Error(`Automations hub could not find ${label}`);
  source = source.replace(from, to);
  changes += 1;
};

// UI-only state. Existing DCA bot state, APIs, persistence and execution remain unchanged.
const stateNeedle = '  const [botModalMode, setBotModalMode] = useState<BotModalMode>(null);\n';
if (!source.includes('automationPickerOpen')) {
  if (!source.includes(stateNeedle)) throw new Error("Automations hub could not find bot modal state");
  source = source.replace(
    stateNeedle,
    stateNeedle + '  const [automationPickerOpen, setAutomationPickerOpen] = useState(false);\n  const [automationTypeFilter, setAutomationTypeFilter] = useState<"All" | "DCA">("All");\n',
  );
  changes += 1;
}

replaceOnce(
  '<div className={styles.pageHeading}><div><small>AUTOMATIONS · DCA</small><h1>Automations</h1></div><button className={styles.primaryButton} onClick={openCreateBot}>＋ New DCA Strategy</button></div>',
  '<div className={styles.pageHeading}><div><small>AUTOMATIONS</small><h1>Automations</h1></div><button className={styles.primaryButton} onClick={() => setAutomationPickerOpen(true)}>＋ New Automation</button></div>',
  'final Automations heading/action',
);

replaceOnce(
  '<div className={dca.botToolbar}><div className={dca.botTabs}><button className={botTab === "Active" ? dca.tabActive : ""} onClick={() => setBotTab("Active")}>Running / paused <span>{activeBots.length}</span></button><button className={botTab === "Closed" ? dca.tabActive : ""} onClick={() => setBotTab("Closed")}>Archived <span>{closedBots.length}</span></button></div><span className={dca.hint}>Open any automation to inspect its strategy and capital plan.</span></div>',
  '<div className={dca.botToolbar}><div className={dca.botTabs}><button className={botTab === "Active" ? dca.tabActive : ""} onClick={() => setBotTab("Active")}>Running / paused <span>{activeBots.length}</span></button><button className={botTab === "Closed" ? dca.tabActive : ""} onClick={() => setBotTab("Closed")}>Archived <span>{closedBots.length}</span></button></div><span className={dca.hint}>Open any automation to inspect its strategy and capital plan.</span></div><div className={dca.botToolbar}><div className={dca.botTabs}><button className={automationTypeFilter === "All" ? dca.tabActive : ""} onClick={() => setAutomationTypeFilter("All")}>All</button><button className={automationTypeFilter === "DCA" ? dca.tabActive : ""} onClick={() => setAutomationTypeFilter("DCA")}>DCA</button><button disabled title="Grid Automation is coming soon">Grid <span>Soon</span></button><button disabled title="TradingView Signals are coming soon">TradingView <span>Soon</span></button></div><span className={dca.hint}>DCA is available now · Grid and TradingView Signals are coming soon.</span></div>',
  'automation lifecycle/type toolbar',
);

// Existing rows are DCA automations. Make the type explicit and remove legacy Long labelling.
replaceOnce(
  '<small>Long · {bot.startCondition} · {bot.executionMode}</small>',
  '<small>DCA · {bot.startCondition} · {bot.executionMode}</small>',
  'automation row identity',
);

source = source.replaceAll('No {botTab.toLowerCase()} bots', 'No {botTab.toLowerCase()} automations');
source = source.replaceAll('Create a DCA strategy to start automating this account.', 'Create a DCA automation to start automating this account.');
source = source.replaceAll('Closed automations remain here with their complete strategy history.', 'Archived automations remain here with their complete strategy history.');

const exchangeModalMarker = '    {exchangeModal && <div className={styles.backdrop}';
if (!source.includes('Choose an automation type')) {
  if (!source.includes(exchangeModalMarker)) throw new Error("Automations hub could not find modal insertion point");
  const picker = `    {automationPickerOpen && <div className={styles.backdrop} onMouseDown={(event) => { if (event.target === event.currentTarget) setAutomationPickerOpen(false); }}><section className={styles.modal}><div className={styles.modalHead}><div><small>AUTOMATIONS</small><h2>New Automation</h2><p>Choose an automation type. Only DCA is available in this launch version.</p></div><button onClick={() => setAutomationPickerOpen(false)}>×</button></div><button className={styles.exchangeChoice} onClick={() => { setAutomationPickerOpen(false); openCreateBot(); }}><span className={styles.exchangeChoiceLogo}>D</span><div><strong>DCA Automation</strong><small>Build an entry ladder, average price and planned exits.</small></div><span>CREATE</span></button><button className={styles.exchangeChoice} disabled><span className={styles.exchangeChoiceLogo}>G</span><div><strong>Grid Automation</strong><small>Trade repeated moves inside a configured price range.</small></div><span>SOON</span></button><button className={styles.exchangeChoice} disabled><span className={styles.exchangeChoiceLogo}>TV</span><div><strong>TradingView Signals</strong><small>Trigger automations from TradingView alerts and webhooks.</small></div><span>SOON</span></button><div className={styles.comingSoon}>Coming Soon options are visible for roadmap clarity but cannot be launched yet.</div></section></div>}\n\n`;
  source = source.replace(exchangeModalMarker, picker + exchangeModalMarker);
  changes += 1;
}

for (const required of [
  'setAutomationPickerOpen(true)',
  'New Automation',
  'DCA Automation',
  'Grid Automation',
  'TradingView Signals',
  'Grid <span>Soon</span>',
  'TradingView <span>Soon</span>',
  '<small>DCA · {bot.startCondition} · {bot.executionMode}</small>',
]) {
  if (!source.includes(required)) throw new Error(`Automations hub output missing: ${required}`);
}

fs.writeFileSync(shellPath, source);
console.log(`Prepared LabNarrative Automations hub (${changes} structural changes; theme, DCA configurator and execution untouched).`);
