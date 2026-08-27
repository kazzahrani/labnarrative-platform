import fs from "node:fs";
import path from "node:path";

const traderPath = path.join(process.cwd(), "app", "trader", "TraderV2FullShell.tsx");
const shellCssPath = path.join(process.cwd(), "app", "trader", "trader-v2.module.css");
const dcaCssPath = path.join(process.cwd(), "app", "trader", "trader-dca-v2.module.css");

for (const file of [traderPath, shellCssPath, dcaCssPath]) {
  if (!fs.existsSync(file)) throw new Error(`Trader independence target not found: ${file}`);
}

let source = fs.readFileSync(traderPath, "utf8");
let changes = 0;

const replacements = [
  // Front-end navigation/state language only. Backend trade objects stay unchanged.
  ['"Active Trades"', '"Active Positions"'],
  ['"Closed Trades"', '"Closed Positions"'],

  // Global product identity.
  ['<small>Trading</small>', '<small>Strategy Studio</small>'],

  // Dashboard, bot list and position pages.
  ['<span>Active trades</span>', '<span>Active positions</span>'],
  ['<span>Closed trades</span>', '<span>Closed positions</span>'],
  ['<span>Trades</span>', '<span>Positions</span>'],
  ['<small>Across active and closed bot trades</small>', '<small>Across active and closed bot positions</small>'],
  ['<small>Active + closed bot trades</small>', '<small>Active + closed bot positions</small>'],
  ['<small>DCA trade PnL</small>', '<small>DCA position PnL</small>'],
  ['<small>Permanent trade history</small>', '<small>Permanent position history</small>'],
  ['<h1>{tradeState} Trades</h1>', '<h1>{tradeState} Positions</h1>'],
  ['<span>{tradeState} trades</span>', '<span>{tradeState} positions</span>'],
  ['DCA BOTS · TRADES', 'DCA BOTS · POSITIONS'],
  ['Closed bots remain here with their complete history.', 'Closed bots remain here with their complete strategy history.'],
  ['Create a DCA bot to start automating this account.', 'Create a DCA strategy and test it on this account.'],
  ['Create your first DCA bot to begin.', 'Create your first DCA strategy to begin.'],
  ['Open DCA positions will appear here with a live PnL bar.', 'Open DCA positions appear here with live performance and execution status.'],
  ['Completed DCA trades remain here and can still be opened on the chart.', 'Completed DCA positions remain here and can still be opened on the chart.'],
  ['Click any bot to open its full configuration.', 'Open any bot to inspect its strategy and capital plan.'],

  // Bot read-only configuration vocabulary.
  ['<span>Active trades</span><b>{bot.activeTradeCount} / {bot.maxActiveTrades}</b>', '<span>Active positions</span><b>{bot.activeTradeCount} / {bot.maxActiveTrades}</b>'],
  ['<h3>Main settings</h3>', '<h3>Market & Entry</h3>'],
  ['<h3>Averaging orders</h3>', '<h3>DCA Plan</h3>'],
  ['<h3>Exit settings</h3>', '<h3>Exit</h3>'],
  ['<h3>Concurrency</h3>', '<h3>Position Limits</h3>'],
  ['<span>Start condition</span>', '<span>Entry condition</span>'],
  ['<span>Base order</span>', '<span>Initial order</span>'],
  ['<span>Safety order</span>', '<span>DCA order size</span>'],
  ['<span>Max safety orders</span>', '<span>Maximum DCA orders</span>'],
  ['<span>Active safety orders</span>', '<span>Active DCA orders</span>'],
  ['<span>Price deviation</span>', '<span>First DCA trigger</span>'],
  ['<span>Step scale</span>', '<span>Price step multiplier</span>'],
  ['<span>Volume scale</span>', '<span>Order size multiplier</span>'],
  ['<span>Max active trades</span>', '<span>Maximum active positions</span>'],
  ['<span>Capital plan</span>', '<span>Planned capital</span>'],

  // Bot editor grouping and language.
  ['<h3>Main settings</h3><p>Core pair and initial order configuration.</p>', '<h3>Market & Entry</h3><p>Choose the market and define how the position opens.</p>'],
  ['<h3>Averaging orders</h3><p>Control the DCA ladder, order count and capital scaling.</p>', '<h3>DCA Plan</h3><p>Define additional entries, order count, spacing and capital scaling.</p>'],
  ['<h3>Exit settings</h3><p>Take profit and optional stop loss.</p>', '<h3>Exit</h3><p>Define how the position realizes profit or limits downside.</p>'],
  ['<h3>DCA ladder preview</h3><p>Capital requirements based on the configured volume and step scales.</p>', '<h3>Capital Preview</h3><p>See the DCA ladder and maximum capital exposure before launch.</p>'],
  ['<span>Total planned capital</span>', '<span>Maximum planned capital</span>'],
  [' safety orders</b>', ' DCA orders</b>'],

  // Position-level messages and summaries.
  ['Existing active trades keep their current trade levels; new trades use the updated bot settings.', 'Existing active positions keep their current execution levels; new positions use the updated bot settings.'],
  ['Pair cannot be changed while this bot has an active trade. Other settings can still be edited.', 'Pair cannot be changed while this bot has an active position. Other settings can still be edited.'],
  ['Its bot and trade history will remain available.', 'Its bot and position history will remain available.'],
  [' active trade{selectedBot.activeTradeCount === 1 ? "" : "s"}. Its pair is locked until those trades close. Other saved settings apply to future trades; existing active trades retain their current trade-level DCA/TP/SL values.', ' active position{selectedBot.activeTradeCount === 1 ? "" : "s"}. Its pair is locked until those positions close. Other saved settings apply to future positions; existing active positions retain their current position-level DCA/TP/SL values.'],
  ['<span>Averaging <b>{trade.averagingFilled} / {trade.maxAveraging}</b></span>', '<span>DCA filled <b>{trade.averagingFilled} / {trade.maxAveraging}</b></span>'],
];

for (const [from, to] of replacements) {
  if (!source.includes(from)) continue;
  const before = source;
  source = source.split(from).join(to);
  if (source !== before) changes += 1;
}

const forbiddenVisibleFragments = [
  ">Base order<", ">Safety order<", ">Max safety orders<", ">Active safety orders<",
  ">Price deviation<", ">Step scale<", ">Volume scale<", ">Main settings<",
  ">Averaging orders<", ">Exit settings<", ">Concurrency<",
];
const remaining = forbiddenVisibleFragments.filter((fragment) => source.includes(fragment));
if (remaining.length) throw new Error(`Trader independence transform incomplete: ${remaining.join(", ")}`);

fs.writeFileSync(traderPath, source);

// Final-stage visual identity. This runs after every legacy Trader preparation script,
// so the deployed surface cannot be silently restored to the older visual system.
const shellMarker = "/* LABNARRATIVE TRADER VISUAL IDENTITY V2 */";
let shellCss = fs.readFileSync(shellCssPath, "utf8");
if (!shellCss.includes(shellMarker)) shellCss += `\n\n${shellMarker}\n
.page{--ln-bg:#0b1016;--ln-panel:#111922;--ln-panel-2:#151f2a;--ln-line:#24303d;--ln-line-soft:#1c2732;--ln-text:#f4f7fa;--ln-muted:#8494a6;--ln-accent:#7ee2cf;--ln-accent-soft:rgba(126,226,207,.10);min-height:100vh;background:radial-gradient(circle at 76% -10%,rgba(68,121,150,.16),transparent 34%),#0b1016;color:var(--ln-text);grid-template-columns:252px minmax(0,1fr)}
.sidebar{background:linear-gradient(180deg,#0f161f 0%,#0b1016 100%);border-right:1px solid var(--ln-line);padding:24px 18px}.brand{gap:12px}.brandMark{width:42px;height:42px;border-radius:13px;background:linear-gradient(145deg,#a8f2e4,#6fcdbf);color:#08211c;box-shadow:0 10px 28px rgba(70,205,181,.16)}.brand strong{font-size:15px}.brand small{color:#6f8598;letter-spacing:.05em}.nav{margin-top:38px;gap:5px}.nav button{height:44px;border-radius:11px;color:#7f91a4;padding:0 13px;position:relative}.nav button:hover{background:#131d27;color:#dbe4ec}.navActive{background:linear-gradient(90deg,rgba(126,226,207,.13),rgba(126,226,207,.035))!important;color:#ecfffb!important;border:1px solid rgba(126,226,207,.13)!important}.navActive:before{content:"";position:absolute;left:0;top:9px;bottom:9px;width:3px;border-radius:3px;background:var(--ln-accent)}.navActive span{color:var(--ln-accent)!important}.sidebarBottom{border-top-color:var(--ln-line);padding-top:16px}.liveDot{background:var(--ln-accent);box-shadow:0 0 0 5px rgba(126,226,207,.08)}
.workspace{background:transparent}.topbar{height:76px;background:rgba(11,16,22,.86);backdrop-filter:blur(16px);border-bottom:1px solid var(--ln-line);padding:0 32px}.topbar>div:first-child small{color:#617386}.topbar>div:first-child strong{font-size:13px}.accountButton{height:48px;min-width:208px;background:#111923;border-color:var(--ln-line);border-radius:12px}.accountButton>span{width:30px;height:30px;border-radius:9px;background:var(--ln-accent);color:#08211c}.accountButton small{color:#6d8092}.accountMenu{background:#111923;border-color:var(--ln-line);border-radius:14px}.accountMenu button:hover,.accountMenuActive{background:#17222d!important}.content{padding:28px 32px 64px;max-width:1620px}.pageHeading{margin-bottom:20px}.pageHeading small{color:#607286}.pageHeading h1{font-size:30px;letter-spacing:-.04em}.primaryButton{background:var(--ln-accent);border-color:var(--ln-accent);color:#08211c;box-shadow:0 8px 24px rgba(61,199,175,.11)}.primaryButton:hover{filter:brightness(1.03)}.ghostButton{border-color:var(--ln-line);background:#111923;color:#9aabba}
.heroGrid{grid-template-columns:minmax(0,1.6fr) minmax(280px,.65fr);gap:14px}.heroCard,.metricCard,.panel{background:linear-gradient(180deg,#121b25,#0f171f);border:1px solid var(--ln-line);border-radius:16px;box-shadow:0 12px 30px rgba(0,0,0,.12)}.heroCard{padding:26px 28px;min-height:224px;position:relative}.heroCard:before{content:"";position:absolute;inset:0 0 auto 0;height:2px;background:linear-gradient(90deg,var(--ln-accent),rgba(126,226,207,0));border-radius:16px 16px 0 0}.heroCard>strong{font-size:44px}.cardTop{color:#96a6b5}.heroMeta{color:#718498}.chartLine{border-bottom-color:#1e2a36}.chartLine i{background:linear-gradient(180deg,rgba(126,226,207,.58),rgba(72,111,115,.12))}.metricStack{gap:10px}.metricCard{padding:17px 18px;border-radius:14px}.metricCard span{color:#75889a}.metricCard strong{font-size:24px}.metricCard small{color:#607284}.dashboardGrid,.portfolioGrid{gap:14px;margin-top:14px}.panel{padding:20px}.panelTitle h2{font-size:14px}.panelTitle p{color:#65788a}.exchangeRow,.simpleRow,.emptyCompact,.assetRow{border-top-color:var(--ln-line-soft)}.exchangeLogo,.exchangeChoiceLogo{background:#172630;color:var(--ln-accent);border:1px solid rgba(126,226,207,.18)}.statGrid{background:var(--ln-line);border-color:var(--ln-line);border-radius:13px}.statGrid>div{background:#111923}.positive{color:#8be7c7!important}.negative{color:#ff9f9f!important}.notice,.errorNotice{background:#121b25;border-color:var(--ln-line);border-radius:12px}.loadingCard{background:#111923;border-color:var(--ln-line);border-radius:16px}.modal{background:#101821;border-color:var(--ln-line);border-radius:18px}.exchangeChoice{background:#131d27;border-color:var(--ln-line);border-radius:13px}.exchangeChoice:hover{background:#17232e}.authPage,.loadingPage{background:radial-gradient(circle at 50% -20%,rgba(78,145,151,.18),transparent 38%),#0b1016}.authCard{background:#111923;border-color:var(--ln-line);border-radius:18px}.authBrand>span{background:var(--ln-accent);color:#08211c}.authForm input{background:#0d141c!important;border-color:var(--ln-line)!important}
@media(max-width:900px){.page{grid-template-columns:210px minmax(0,1fr)}.content{padding:24px 22px 50px}.topbar{padding:0 22px}}
`;
fs.writeFileSync(shellCssPath, shellCss);

const dcaMarker = "/* LABNARRATIVE TRADER DCA VISUAL IDENTITY V2 */";
let dcaCss = fs.readFileSync(dcaCssPath, "utf8");
if (!dcaCss.includes(dcaMarker)) dcaCss += `\n\n${dcaMarker}\n
.dcaIntro{gap:10px;margin-bottom:18px}.metric{background:linear-gradient(180deg,#121b25,#0f171f);border:1px solid #24303d;border-radius:14px;padding:16px 17px;position:relative;overflow:hidden}.metric:before{content:"";position:absolute;left:0;top:0;bottom:0;width:2px;background:#7ee2cf;opacity:.55}.metric span{color:#74889b}.metric strong{font-size:22px}.metric small{color:#607386}.green{color:#8be7c7!important}.red{color:#ff9f9f!important}.botToolbar{margin-bottom:14px}.botTabs{background:#0f171f;border:1px solid #24303d;border-radius:12px;padding:4px}.botTabs button{border:0;background:transparent;border-radius:9px;padding:7px 12px}.tabActive{background:#192630!important;color:#eafffa!important;border:0!important;box-shadow:inset 0 0 0 1px rgba(126,226,207,.15)}.tabActive span{color:#7ee2cf!important}.hint{color:#617487}.botTable{background:transparent;border:0;border-radius:0;overflow:visible}.botHead{background:#0e151d;border:1px solid #202c38;border-radius:11px;min-height:38px;margin-bottom:8px;color:#627588}.botRow{background:linear-gradient(180deg,#121b25,#101820);border:1px solid #24303d;border-radius:13px;min-height:64px;margin-bottom:8px}.botRow:hover{background:#16222d;border-color:#314252;transform:translateY(-1px)}.botIdentity strong{color:#eef5f8}.botIdentity small{color:#6e8193}.botCell{color:#aebbc6}.status{color:#8395a5}.rowActions button{background:#0f171f;border-color:#2a3745;color:#9babb9}.rowActions button:hover{background:#18232d;color:#edf5f8}.empty{background:#111923;border:1px solid #24303d;border-radius:14px}.overlay{background:rgba(3,7,11,.78);backdrop-filter:blur(6px)}.detail{background:#0f171f;border:1px solid #2a3947;border-radius:18px;box-shadow:0 36px 110px rgba(0,0,0,.55)}.detailHeader{background:rgba(15,23,31,.94);backdrop-filter:blur(14px);border-bottom-color:#24303d;padding:19px 22px}.detailTitle small{color:#648092}.detailTitle h2{font-size:23px}.detailTitle p{color:#6d8193}.detailHeaderActions button{background:#121c25;border-color:#2a3947;color:#9fb0bd}.detailHeaderActions .primary{background:#7ee2cf;color:#08211c;border-color:#7ee2cf}.detailBody{padding:20px 22px 24px}.summaryGrid{gap:8px}.summaryItem{background:#121b25;border-color:#24303d;border-radius:12px}.summaryItem span{color:#718497}.settingsGrid{gap:11px}.settingsCard{background:#111923;border-color:#24303d;border-radius:14px;padding:16px}.settingsCard h3{font-size:11px;color:#edf5f8;text-transform:uppercase;letter-spacing:.06em}.settingRow{border-top-color:#1d2934}.settingRow span{color:#718497}.settingRow b{color:#d9e3ea}.editorGrid{gap:10px}.editorGrid input,.editorGrid select{background:#0c131a;border-color:#2b3946;border-radius:9px}.editorGrid label>span{color:#748799}.sectionDivider{border-top-color:#24303d;margin:20px 0 12px}.sectionDivider h3{font-size:13px}.sectionDivider p{color:#617486}.preview{background:#0e161e;border-color:#24303d;border-radius:13px}.previewTop{border-bottom-color:#1f2b36}.previewHead{color:#637689}.previewRow{border-top-color:#1c2731;color:#a8b5c0}.editorNotice{background:#121b25;border-color:#2a3947;color:#8497a8}.modalFooter{border-top-color:#24303d}.modalFooter button{background:#121b25;border-color:#2a3947}.modalFooter .primary{background:#7ee2cf;color:#08211c;border-color:#7ee2cf}.tradeStats{gap:10px}.tradeCard{background:linear-gradient(180deg,#121b25,#0f171f);border-color:#24303d;border-radius:14px;padding:15px 17px}.tradeCard:hover{background:#16222d;border-color:#314252;transform:translateY(-1px)}.tradeIdentity small,.tradeValue span,.tradeMeta{color:#687b8e}.tradeValue b,.tradeMeta span b{color:#cbd6de}.chartButton{background:#0f171f;border-color:#2b3946;color:#a5b4c0}.liveStrip{border-top-color:#1f2b36}.liveTrack{background:#1d2934}.liveTrack i{background:#526271}.liveTrack b{background:#7ee2cf}.liveTrack b[data-negative="true"]{background:#ff9f9f}.liveDot{background:#7ee2cf;box-shadow:0 0 0 4px rgba(126,226,207,.08)}
`;
fs.writeFileSync(dcaCssPath, dcaCss);

console.log(`LabNarrative Trader independence UI prepared (${changes} replacement groups applied; visual identity V2 enforced).`);
