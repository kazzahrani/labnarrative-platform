import fs from "node:fs";
import path from "node:path";

const analyticsPath = path.join(process.cwd(), "app", "trader", "Analytics.tsx");
if (!fs.existsSync(analyticsPath)) throw new Error("Analytics layout-cleanup target missing");
let source = fs.readFileSync(analyticsPath, "utf8");

function replaceOnce(from, to, label) {
  if (!source.includes(from)) throw new Error(`Analytics layout cleanup missing ${label}`);
  source = source.replace(from, to);
}

const topFilters = `    <section className={styles.globalFilters} data-analytics-motion>
      <div><small>BOT FILTERS</small><strong>Analytics scope</strong><span>Every metric and figure below uses this bot set.</span></div>
      <div className={styles.globalFilterControls}>
        <label><span>Status</span><select value={scope} onChange={(event) => setScope(event.target.value)} aria-label="Analytics bot status"><option value="all">All statuses</option><option value="running">Running</option><option value="paused">Paused</option><option value="archived">Archived</option></select></label>
        <label><span>Automation</span><select value={type} onChange={(event) => setType(event.target.value)} aria-label="Analytics automation type"><option value="all">All types</option><option value="DCA">DCA</option><option value="Strategy Execution">Strategy Execution</option></select></label>
      </div>
    </section>

`;
replaceOnce(topFilters, "", "top filter block");

const tableControls = '<div className={styles.compareControls}><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search automation" aria-label="Search automations"/></div>';
const restoredTableControls = '<div className={styles.compareControls}><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search automation" aria-label="Search automations"/><select value={scope} onChange={(event) => setScope(event.target.value)} aria-label="Automation state"><option value="all">All automations</option><option value="running">Running</option><option value="paused">Paused</option><option value="archived">Archived</option></select><select value={type} onChange={(event) => setType(event.target.value)} aria-label="Automation type"><option value="all">All types</option><option value="DCA">DCA</option><option value="Strategy Execution">Strategy Execution</option></select></div>';
replaceOnce(tableControls, restoredTableControls, "restored table filters");

replaceOnce(
  '<div><small>CUMULATIVE REALIZED PNL</small><h2>{selectedName}</h2></div>',
  '<div><small>CUMULATIVE REALIZED PNL</small></div>',
  "cumulative subtitle",
);
replaceOnce(
  '<div><small>OUTCOME MIX</small><h3>{selectedName}</h3></div>',
  '<div><small>OUTCOME MIX</small></div>',
  "outcome subtitle",
);
replaceOnce(
  '<div><small>EXIT DISTRIBUTION</small><h3>How positions ended</h3></div>',
  '<div><small>EXIT DISTRIBUTION</small></div>',
  "exit subtitle",
);
replaceOnce(
  '<div><small>MARKET CONTRIBUTION</small><h3>Where PnL came from</h3></div>',
  '<div><small>MARKET CONTRIBUTION</small></div>',
  "market subtitle",
);
replaceOnce(
  '<small>AUTOMATION COMPARISON</small><h2>Performance table</h2><p>One ledger, one definition for every automation.</p>',
  '<small>PERFORMANCE TABLE</small>',
  "performance table title",
);

const botBars = '<div className={styles.botBars}>{automations.filter((item) => item.closedTrades > 0).sort((a, b) => b.realizedPnl - a.realizedPnl).slice(0, 7).map((item) => <button type="button" key={item.id} onClick={() => setSelectedId(item.id)} title={`Select ${item.name}`}><span>{item.name}</span><div><i className={pnlClass(item.realizedPnl)} style={{ width: `${Math.max(4, Math.abs(item.realizedPnl) / maxBotMagnitude * 100)}%` }}/></div><b className={pnlClass(item.realizedPnl)}>{money(item.realizedPnl)}</b></button>)}</div>\n\n        ';
replaceOnce(botBars, "", "best-performing bot bars");
replaceOnce(
  '  const maxBotMagnitude = Math.max(0.000001, ...automations.map((item) => Math.abs(item.realizedPnl)));\n',
  '',
  "unused bot-bar magnitude",
);

for (const marker of [
  'aria-label="Automation state"',
  '<option value="paused">Paused</option>',
  'aria-label="Automation type"',
  '<small>PERFORMANCE TABLE</small>',
]) if (!source.includes(marker)) throw new Error(`Analytics layout-cleanup output missing ${marker}`);

for (const forbidden of [
  'className={styles.globalFilters}',
  '<h2>{selectedName}</h2>',
  '<h3>{selectedName}</h3>',
  '<h3>How positions ended</h3>',
  '<h3>Where PnL came from</h3>',
  '<small>AUTOMATION COMPARISON</small>',
  'className={styles.botBars}',
  'maxBotMagnitude',
]) if (source.includes(forbidden)) throw new Error(`Analytics layout cleanup still contains ${forbidden}`);

fs.writeFileSync(analyticsPath, source);
console.log("Restored Analytics filters to the Performance Table controls and removed redundant chart subtitles/bot bars.");
