import fs from "node:fs";
import path from "node:path";

const target = path.join(process.cwd(), "app", "trader", "PortfolioIntelligence.tsx");
const cssTarget = path.join(process.cwd(), "app", "trader", "portfolio-intelligence.module.css");
if (!fs.existsSync(target) || !fs.existsSync(cssTarget)) throw new Error("Portfolio snapshot redesign targets missing");
let source = fs.readFileSync(target, "utf8");
let css = fs.readFileSync(cssTarget, "utf8");

if (!source.includes("PAPER PORTFOLIO TIME MACHINE V1")) throw new Error("Portfolio Time Machine must run before snapshot redesign");

if (!source.includes("PORTFOLIO SNAPSHOT V2")) {
  const oldImport = 'import BenchmarkPerformanceChart from "./BenchmarkPerformanceChart";';
  if (!source.includes(oldImport)) throw new Error("Portfolio benchmark import anchor missing");
  source = source.replace(oldImport, 'import PortfolioValueSnapshot from "./PortfolioValueSnapshot";\n// PORTFOLIO SNAPSHOT V2 — distinct long-term portfolio view.');

  const allocationAnchor = '  const allocationGradient = donut(allocationItems);';
  if (!source.includes(allocationAnchor)) throw new Error("Portfolio allocation anchor missing");
  source = source.replace(allocationAnchor, [
    allocationAnchor,
    '  const sourceMixItems = [',
    '    { label: "Cash & stablecoins", value: cashValue, color: COLORS[0] },',
    '    { label: "Long-term holdings", value: coreValue, color: COLORS[1] },',
    '    { label: "Included bot positions", value: botExposure, color: COLORS[2] },',
    '  ].filter((item) => item.value > 0.005);',
    '  const sourceMixGradient = donut(sourceMixItems);',
  ].join("\n"));

  const scopeStart = source.indexOf('    <section className={styles.scopeBar}>');
  const metricsStart = source.indexOf('    <div className={styles.metrics}>', scopeStart);
  if (scopeStart < 0 || metricsStart <= scopeStart) throw new Error("Portfolio scope bar block missing");
  const toolbar = [
    '    <div className={styles.portfolioToolbar}>',
    '      <div className={styles.botScopeDropdown}>',
    '        <button type="button" className={styles.botPositionsButton + " " + (scope !== "core" ? styles.botPositionsOn : "")} onClick={() => setBotListOpen((open) => !open)}>',
    '          <span className={styles.switch}><i /></span><b>Bot positions</b><small>{scope === "core" ? "Excluded" : scope === "all" ? "All included" : "Custom"}</small><span className={styles.scopeChevron}>▾</span>',
    '        </button>',
    '        {botListOpen && <div className={styles.botScopeMenu}>',
    '          <button type="button" className={styles.botMaster + " " + (scope !== "core" ? styles.botIncluded : "")} onClick={() => void persist(scope === "core" ? (excludedBots.length ? "custom" : "all") : "core", excludedBots)}><span className={styles.switch}><i /></span><div><strong>Include bot positions</strong><small>Master portfolio switch</small></div><b>{scope === "core" ? "Off" : "On"}</b></button>',
    '          <div className={styles.botScopeMenuHead}><strong>Choose automations</strong><small>Included positions are reconciled and never double-counted.</small></div>',
    '          <div className={styles.botScope}>{bots.filter((bot) => bot.lifecycle !== "closed" || botRows.some((row) => row.id === bot.id)).map((bot) => { const exposure = botRows.find((row) => row.id === bot.id); const included = scope === "all" || (scope === "custom" && !excludedSet.has(bot.id)); return <button type="button" key={bot.id} className={styles.botToggle + " " + (included ? styles.botIncluded : "")} onClick={() => toggleBot(bot.id)}><span className={styles.switch}><i /></span><div><strong>{bot.name}</strong><small>{bot.executionMode || "Automation"} · {bot.status}</small></div><b>{exposure ? plainMoney(exposure.value) : "No open position"}</b></button>; })}</div>',
    '          {!bots.length && <div className={styles.emptySmall}>No automations on this account yet.</div>}',
    '        </div>}',
    '      </div>',
    '      <div className={styles.ranges}>{RANGE_OPTIONS.map(([value, label]) => <button type="button" key={value} className={range === value ? styles.active : ""} onClick={() => setRange(value)}>{label}</button>)}</div>',
    '    </div>',
    '',
  ].join("\n");
  source = source.slice(0, scopeStart) + toolbar + source.slice(metricsStart);

  const heroStart = source.indexOf('    <section className={`${styles.card} ${styles.heroChart}`}>');
  const heroEnd = source.indexOf('\n\n    <div className={styles.twoCol}>', heroStart);
  if (heroStart < 0 || heroEnd <= heroStart) throw new Error("Portfolio hero chart block missing");
  const hero = [
    '    <section className={`${styles.card} ${styles.snapshotCard}`}>',
    '      <PortfolioValueSnapshot',
    '        series={wealthSeries}',
    '        base={historyBase}',
    '        currentValue={currentValue || equity}',
    '        allocation={holdings.map((row, index) => ({ label: row.symbol, value: row.value, color: COLORS[index % COLORS.length] }))}',
    '      />',
    '    </section>',
  ].join("\n");
  source = source.slice(0, heroStart) + hero + source.slice(heroEnd);

  const healthStart = source.indexOf('      <section className={styles.card}><header><div><small>PORTFOLIO HEALTH</small>');
  const healthEnd = source.indexOf('</section>\n    </div>', healthStart);
  if (healthStart < 0 || healthEnd <= healthStart) throw new Error("Portfolio Health card missing");
  const capitalStructure = [
    '      <section className={styles.card}>',
    '        <header><div><small>CAPITAL STRUCTURE</small><h2>Where your capital sits</h2></div><span>Cash · long-term · automations</span></header>',
    '        <div className={styles.sourceMixBody}>',
    '          <div className={styles.sourceDonut} style={{ background: sourceMixGradient }}><div><strong>{sourceMixItems.length}</strong><span>capital buckets</span></div></div>',
    '          <div className={styles.sourceLegend}>{sourceMixItems.map((item) => <div key={item.label}><i style={{ background: item.color }}/><span>{item.label}</span><b>{currentValue > 0 ? `${(item.value / currentValue * 100).toFixed(1)}%` : "0%"}</b><small>{plainMoney(item.value)}</small></div>)}</div>',
    '        </div>',
    '      </section>',
  ].join("\n");
  source = source.slice(0, healthStart) + capitalStructure + source.slice(healthEnd + '</section>'.length);

  css += '\n/* PORTFOLIO SNAPSHOT V2 */\n.portfolioToolbar{display:flex;justify-content:space-between;align-items:center;gap:12px;min-height:38px;padding:0 1px;position:relative;z-index:15}.portfolioToolbar .ranges{margin-left:auto}.botPositionsButton{display:grid;grid-template-columns:28px auto auto 18px;align-items:center;gap:8px;padding:7px 10px;border:1px solid #3a3a3a;border-radius:10px;background:#242424;color:#aaa;font:inherit;cursor:pointer;transition:border-color .18s ease,background .18s ease,transform .18s ease}.botPositionsButton:hover{border-color:#555;transform:translateY(-1px)}.botPositionsButton>b{font-size:10px;color:#d0d0d0}.botPositionsButton>small{font-size:8px;color:#737373}.botPositionsOn{border-color:#3c5b4e;background:#202824}.botPositionsOn .switch{background:#285b46}.botPositionsOn .switch i{left:13px;background:#60dca5}.scopeChevron{color:#777;font-size:9px}.botMaster{width:100%;display:grid;grid-template-columns:30px minmax(0,1fr) auto;align-items:center;gap:10px;padding:10px 11px;margin-bottom:8px;border:1px solid #333;border-radius:11px;background:#1d1d1d;color:inherit;text-align:left;cursor:pointer}.botMaster strong{display:block;color:#d7d7d7;font-size:10px}.botMaster small{display:block;margin-top:2px;color:#777;font-size:8px}.botMaster>b{color:#999;font-size:9px}.snapshotCard{padding:17px 18px 13px}.sourceMixBody{display:grid;grid-template-columns:190px minmax(0,1fr);gap:18px;align-items:center;min-height:220px}.sourceDonut{width:176px;height:176px;border-radius:50%;display:grid;place-items:center;position:relative;animation:spinIn .42s cubic-bezier(.2,.8,.2,1);box-shadow:inset 0 0 0 1px rgba(255,255,255,.05)}.sourceDonut:after{content:"";position:absolute;width:112px;height:112px;border-radius:50%;background:#202020;border:1px solid #333}.sourceDonut>div{position:relative;z-index:1;text-align:center}.sourceDonut strong{display:block;color:#ededed;font-size:27px}.sourceDonut span{display:block;margin-top:2px;color:#7e7e7e;font-size:8px}.sourceLegend{display:flex;flex-direction:column;gap:9px}.sourceLegend>div{display:grid;grid-template-columns:10px minmax(0,1fr) auto auto;gap:8px;align-items:center;padding:8px 0;border-bottom:1px solid #2b2b2b}.sourceLegend i{width:8px;height:8px;border-radius:50%}.sourceLegend span{color:#bbb;font-size:10px}.sourceLegend b{color:#d6d6d6;font-size:10px}.sourceLegend small{color:#747474;font-size:8px}@media(max-width:900px){.portfolioToolbar{align-items:flex-start;flex-direction:column}.portfolioToolbar .ranges{margin-left:0;flex-wrap:wrap}.sourceMixBody{grid-template-columns:160px 1fr}.sourceDonut{width:150px;height:150px}.sourceDonut:after{width:96px;height:96px}}@media(max-width:600px){.sourceMixBody{grid-template-columns:1fr}.sourceDonut{margin:0 auto}}\n';
}

for (const marker of [
  'PORTFOLIO SNAPSHOT V2',
  'PortfolioValueSnapshot',
  'className={styles.portfolioToolbar}',
  '>Bot positions</b>',
  'CAPITAL STRUCTURE',
  'Where your capital sits',
]) if (!source.includes(marker)) throw new Error(`Portfolio snapshot redesign missing ${marker}`);
if (source.includes('PORTFOLIO HEALTH')) throw new Error('Portfolio Health card still present');
if (source.includes('className={styles.scopeBar}')) throw new Error('Portfolio scope box still present');

fs.writeFileSync(target, source);
fs.writeFileSync(cssTarget, css);
console.log("Prepared distinct Portfolio snapshot chart, direct controls, and capital-structure donut.");
