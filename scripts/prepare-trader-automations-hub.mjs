import fs from "node:fs";
import path from "node:path";

const shellPath = path.join(process.cwd(), "app", "trader", "TraderV2FullShell.tsx");
const cssPath = path.join(process.cwd(), "app", "trader", "trader-dca-v2.module.css");
for (const target of [shellPath, cssPath]) {
  if (!fs.existsSync(target)) throw new Error(`Automations hub target not found: ${target}`);
}

let source = fs.readFileSync(shellPath, "utf8");
let css = fs.readFileSync(cssPath, "utf8");
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
    stateNeedle + '  const [automationPickerOpen, setAutomationPickerOpen] = useState(false);\n  const [automationTypeFilter, setAutomationTypeFilter] = useState<"All" | "DCA">("All");\n  const [automationFilterOpen, setAutomationFilterOpen] = useState(false);\n',
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
  '<div className={dca.botToolbar}><div className={dca.botTabs}><button className={botTab === "Active" ? dca.tabActive : ""} onClick={() => { setBotTab("Active"); setAutomationFilterOpen(false); }}>Running / paused <span>{activeBots.length}</span></button><button className={botTab === "Closed" ? dca.tabActive : ""} onClick={() => { setBotTab("Closed"); setAutomationFilterOpen(false); }}>Archived <span>{closedBots.length}</span></button><div className={dca.automationFilterWrap}><button type="button" className={automationFilterOpen ? dca.automationFilterTriggerOpen : ""} onClick={() => setAutomationFilterOpen((open) => !open)}>Filter <span>{automationTypeFilter}</span><i>⌄</i></button>{automationFilterOpen && <><div className={dca.automationFilterDismiss} onMouseDown={() => setAutomationFilterOpen(false)} aria-hidden="true"/><div className={dca.automationFilterMenu} onWheel={(event) => event.stopPropagation()}><button type="button" className={automationTypeFilter === "All" ? dca.automationFilterSelected : ""} onClick={() => { setAutomationTypeFilter("All"); setAutomationFilterOpen(false); }}><span>All</span><b>{automationTypeFilter === "All" ? "✓" : ""}</b></button><button type="button" className={automationTypeFilter === "DCA" ? dca.automationFilterSelected : ""} onClick={() => { setAutomationTypeFilter("DCA"); setAutomationFilterOpen(false); }}><span>DCA</span><b>{automationTypeFilter === "DCA" ? "✓" : ""}</b></button><button type="button" disabled title="Grid Automation is coming soon"><span>Grid</span><small>Soon</small></button><button type="button" disabled title="TradingView Strategy is coming soon"><span>TradingView Strategy</span><small>Soon</small></button></div></>}</div></div><span className={dca.hint}>Open any automation to inspect its strategy and capital plan.</span></div>',
  'combined lifecycle/filter toolbar',
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
  const picker = `    {automationPickerOpen && <div className={styles.backdrop} onMouseDown={(event) => { if (event.target === event.currentTarget) setAutomationPickerOpen(false); }}><section className={styles.modal}><div className={styles.modalHead}><div><small>AUTOMATIONS</small><h2>New Automation</h2><p>Choose an automation type. Only DCA is available in this launch version.</p></div><button onClick={() => setAutomationPickerOpen(false)}>×</button></div><button className={styles.exchangeChoice} onClick={() => { setAutomationPickerOpen(false); openCreateBot(); }}><span className={styles.exchangeChoiceLogo}>D</span><div><strong>DCA Automation</strong><small>Build an entry ladder, average price and planned exits.</small></div><span>CREATE</span></button><button className={styles.exchangeChoice} style={{marginTop:8}} disabled><span className={styles.exchangeChoiceLogo}>G</span><div><strong>Grid Automation</strong><small>Trade repeated moves inside a configured price range.</small></div><span>SOON</span></button><button className={styles.exchangeChoice} style={{marginTop:8}} disabled><span className={styles.exchangeChoiceLogo}>TV</span><div><strong>TradingView Strategy</strong><small>Execute a tested TradingView strategy through a connected exchange or broker using TradingView alerts and webhooks.</small></div><span>SOON</span></button><div className={styles.comingSoon}>Coming Soon options are visible for roadmap clarity but cannot be launched yet.</div></section></div>}\n\n`;
  source = source.replace(exchangeModalMarker, picker + exchangeModalMarker);
  changes += 1;
}

const filterCss = `
.automationFilterWrap{position:relative}
.automationFilterWrap>button{display:flex;align-items:center;gap:6px}
.automationFilterWrap>button i{font-style:normal;font-size:9px;line-height:1;transition:transform .14s ease}
.automationFilterTriggerOpen i{transform:rotate(180deg)}
.automationFilterDismiss{position:fixed;inset:0;z-index:21}
.automationFilterMenu{position:absolute;top:calc(100% + 7px);left:0;z-index:22;min-width:205px;max-height:min(280px,50vh);overflow-y:auto;overscroll-behavior:contain;padding:6px;border:1px solid #373737;background:#222;border-radius:13px;box-shadow:0 16px 34px rgba(0,0,0,.3)}
.automationFilterMenu button{width:100%;border:0;background:transparent;color:#aaa;border-radius:9px;padding:9px 10px;display:grid;grid-template-columns:1fr auto;gap:12px;align-items:center;text-align:left;font-size:9px;cursor:pointer}
.automationFilterMenu button:hover:not(:disabled),.automationFilterSelected{background:#2b2b2b!important;color:#eee!important}
.automationFilterMenu button b{font-size:9px;font-weight:700;color:#ddd}
.automationFilterMenu button small{font-size:8px;color:#666;text-transform:uppercase;letter-spacing:.08em}
.automationFilterMenu button:disabled{opacity:.48;cursor:not-allowed}
@media(max-width:760px){.automationFilterMenu{left:auto;right:0}}
`;
if (!css.includes('.automationFilterWrap{')) {
  css += filterCss;
  changes += 1;
}

for (const required of [
  'setAutomationPickerOpen(true)',
  'New Automation',
  'DCA Automation',
  'Grid Automation',
  'TradingView Strategy',
  'automationFilterOpen',
  'automationFilterDismiss',
  'Filter <span>{automationTypeFilter}</span>',
  '<span>Grid</span><small>Soon</small>',
  '<span>TradingView Strategy</span><small>Soon</small>',
  '<small>DCA · {bot.startCondition} · {bot.executionMode}</small>',
]) {
  if (!source.includes(required)) throw new Error(`Automations hub output missing: ${required}`);
}
if (!css.includes('.automationFilterMenu{')) throw new Error('Automations hub filter menu CSS missing');
if (!css.includes('overscroll-behavior:contain')) throw new Error('Automations hub filter scroll guard missing');

fs.writeFileSync(shellPath, source);
fs.writeFileSync(cssPath, css);
console.log(`Prepared LabNarrative Automations hub (${changes} structural changes; persistent filter dropdown, TradingView Strategy naming, spaced automation choices, theme and DCA execution untouched).`);
