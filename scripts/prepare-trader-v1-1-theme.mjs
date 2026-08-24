import fs from "node:fs";
import path from "node:path";

const traderPath = path.join(process.cwd(), "app/trader/TradingAgent.tsx");
const cssPath = path.join(process.cwd(), "app/trader/trader.module.css");
let source = fs.readFileSync(traderPath, "utf8");
let css = fs.readFileSync(cssPath, "utf8");

// Trading Automations v1.1 deliberately keeps the complete pre-v1.0 DCA engine.
// This final transform is visual only. If a core DCA capability disappears, fail the
// production build instead of silently shipping a simplified bot builder.
const requiredDcaCapabilities = [
  "maxActiveTrades",
  "pendingLimitEntries",
  "limitSafetyOrders",
  "dcaPendingAveragingReserveForTrade",
  "DCA_ACTIVE_PAIR_STREAMS_V2",
  "normalizeDcaExecution",
  "Trailing Take Profit deviation",
  "Maximum hold period",
  "All coins",
  "Stochastic",
  "Moving Average (MA)",
  "Average Directional Index",
  "Money Flow Index",
  "Commodity Channel Index",
  "Ultimate Oscillator",
  "Parabolic SAR",
  "Heikin Ashi",
  "Add Funds",
  "Export",
  "Copy",
  "Closed trades",
  "Active trades",
];
for (const token of requiredDcaCapabilities) {
  if (!source.includes(token)) throw new Error(`Trading v1.1 guard: missing preserved DCA capability: ${token}`);
}
if (source.includes('>SmartTrade</button>')) throw new Error("Trading v1.1 guard: SmartTrade navigation resurfaced.");

const marker = "/* TRADING AUTOMATIONS V1.1 — THRWA-INSPIRED DESIGN ONLY */";
if (!css.includes(marker)) {
  css += `

${marker}
/*
 * Product rule: do not simplify the DCA engine here. These are presentation overrides
 * only, applied after every functional trader transform has completed.
 */
.appShell{
  --bg:#0c0f0d;--bg2:#0f1310;--panel:#131714;--panel2:#171c18;--input:#0f1310;
  --line:#242a25;--line2:#303830;--text:#f0f3ef;--muted:#8e978f;
  --teal:#b8f64a;--teal2:#9fdd37;--blue:#c9d1ca;--green:#65df87;--red:#fb7185;--yellow:#f2c94c;
  --sidebar:232px;--header:78px;background:var(--bg);color:var(--text);font-size:13px;
  font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
}
.appShell *{scrollbar-color:#343b35 transparent;scrollbar-width:thin}
.appShell button,.appShell input,.appShell select{transition:border-color .16s ease,background .16s ease,color .16s ease,transform .16s ease,box-shadow .16s ease}
.appShell button:active{transform:translateY(1px)}
.topHeader{height:var(--header);background:rgba(12,15,13,.94);backdrop-filter:blur(22px);border-bottom:1px solid #1c211d;padding:0 22px;gap:16px}
.wordmark{width:190px;gap:11px}.wordmark span{width:36px;height:36px;border-radius:13px;background:#f0f3ef;color:#0c0f0d;font-size:9px;box-shadow:none}.wordmark strong{font-size:15px;color:#f4f6f3;font-weight:760;letter-spacing:-.035em}
.sidebarCollapse{border-radius:11px;color:#737c74}.accountSummary span{color:#7c857d}.accountSummary strong{color:#dde3dd}.accountSummary small{color:#9ea79f}
.fullAccessButton,.primaryButton{border:1px solid #f0f3ef!important;background:#f0f3ef!important;color:#0b0e0c!important;border-radius:13px!important;font-weight:780;box-shadow:none}.fullAccessButton:hover,.primaryButton:hover{background:#dfe5df!important;border-color:#dfe5df!important}
.profileButton{border:1px solid #292f2a;background:#171c18;border-radius:13px;color:#dbe1db}
.sidebar{background:#0e120f;border-right:1px solid #1d221e}.nav{padding:22px 12px 0;gap:5px}.nav>button{height:46px;border:1px solid transparent;border-radius:14px;padding:0 11px;color:#89928a;font-weight:650}.nav>button>span{width:27px;height:27px;border-radius:9px;background:#181d19;display:grid;place-items:center;color:#7f8880;font-size:12px}.nav>button:hover{background:#141915;color:#d9ded9}.nav .navActive{background:#191f1a;border-color:#252c26;color:#f1f4f0}.nav .navActive:before{display:none}.nav .navActive>span{background:#f0f3ef;color:#111512}.dcaSubnav{margin:2px 0 8px 35px;padding-left:9px;border-left:1px solid #252c26}.dcaSubnav button{min-height:34px;border:0;background:transparent;color:#707970;border-radius:10px;text-align:left;padding:6px 9px}.dcaSubnav button:hover,.dcaSubnavActive{background:#171c18!important;color:#d9ded9!important}.dcaSubnav button span{background:#232a24;border-radius:7px;padding:1px 6px;color:#a7afa8}
.main{background:var(--bg)}.demoBanner{height:42px;background:#101411;border-bottom:1px solid #1d221e;color:#707970;font-size:11px;font-weight:600}.demoBanner>span{color:#8c958d}.searchStrip{height:50px;padding:9px 28px;background:#0c0f0d;border-bottom:1px solid #171c18}.globalSearch{height:34px;max-width:520px;background:#111512;border:1px solid #242a25;border-radius:12px;color:#69716a}.globalSearch input{color:#dde3dd}.globalSearch kbd{background:#1a201b;border:1px solid #2b322c;border-radius:8px;color:#737c74}
.notice{position:fixed;top:94px;right:25px;width:auto;max-width:470px;margin:0;padding:12px 15px;background:#191f1a;border:1px solid #303830;border-radius:16px;box-shadow:0 20px 70px rgba(0,0,0,.35);color:#d9ded9}
.pageContent,.builderPage{padding:31px 34px 58px;max-width:1540px}.pageHeading{margin-bottom:24px;align-items:center}.pageHeading h1{font-size:30px;letter-spacing:-.045em;color:#f2f5f1;font-weight:720}.pageHeading p{color:#747d75}.eyebrow{font-size:9px;color:#667067;letter-spacing:.16em}.backLink{height:36px;border:1px solid #2b322c;background:#151a16;color:#a9b1aa!important;border-radius:12px}.backLink:hover{background:#1c221d;color:#e3e8e3!important}
.card,.moduleCard,.exchangeCard,.liveMetricCard,.liveDashboardPanel,.dcaDealsFilters,.dcaDealsTableCard,.dcaBotDetailPage section,.dcaBotMissing{background:#131714!important;border:1px solid #242a25!important;border-radius:22px!important;box-shadow:none!important}.cardHeader{height:54px;border-bottom:1px solid #242a25;padding:0 19px}.cardHeader h2{color:#e7ebe7;font-size:14px}.cardHeader button{border:0;background:transparent;color:#909991;cursor:pointer}
.liveDashboardMetrics{gap:12px;margin-bottom:14px}.liveMetricCard{min-height:116px;padding:20px}.liveMetricCard>span{color:#7c857d;font-size:10px}.liveMetricCard>strong{color:#f0f3ef;font-size:23px;letter-spacing:-.04em}.liveMetricCard>small{color:#6d766e}.liveDashboardMainGrid{gap:14px}.liveDashboardAllocation{padding:25px}.liveDashboardDonut{box-shadow:inset 0 0 0 1px rgba(255,255,255,.03)}.liveDashboardDonut>div{background:#131714!important;border-color:#272e28!important}.liveDashboardLegend>div{border-radius:10px;padding:5px 7px}.liveDashboardLegend>div:hover{background:#181d19}.liveDashboardRows{padding:9px 20px 20px}.liveDashboardRows>div{border-bottom-color:#222823;padding:13px 2px}.liveDashboardRows span{color:#7e877f}.liveDashboardRows b{color:#e7ebe7}
.totalBalanceBody,.statisticsBody{padding:28px}.balanceDonut,.portfolioRing{box-shadow:0 0 0 1px #252c26}.balanceDonut:after,.portfolioRing:after{background:#131714}.balanceNumbers>span,.exchangeStats span{color:#747d75}.balanceNumbers>strong{color:#eff3ef;font-size:25px}.balanceChart line{stroke:#252b26}.balanceLine{stroke:#b8f64a}.balanceArea{fill:rgba(184,246,74,.055)}
.exchangeDivider{color:#667067;letter-spacing:.14em}.exchangeCard{padding:18px}.exchangeIcon{background:#222823;color:#bac2bb}.exchangeCardHead h3{color:#e9ede9}.exchangeCardHead p{color:#747d75}.allocationBar{background:#242a25}.allocationBar i{background:#b8f64a}.tradeAccountButton{border:1px solid #2c332d;background:#171c18;color:#bac2bb;border-radius:12px}
.appShell input,.appShell select,.fakeSelect{background:#0f1310!important;border:1px solid #2a312b!important;color:#dbe1db!important;border-radius:12px!important;box-shadow:none!important}.appShell input:focus,.appShell select:focus{border-color:#505b51!important;box-shadow:0 0 0 3px rgba(184,246,74,.045)!important}.appShell input:disabled,.appShell select:disabled{opacity:.52}.appShell label>span{color:#879088!important}.inputUnit{border-radius:12px!important;background:#0f1310!important;border-color:#2a312b!important}.inputUnit input{border:0!important;background:transparent!important}.toggle{background:#333a34}.toggleOn{background:#b8f64a}.toggle i{background:#f7f9f7}.toggleOn i{background:#101410}
.choiceActive,.orderChoice .choiceActive{background:#252c26!important;color:#f0f3ef!important;border-color:#39423a!important}.orderChoice{background:#101411;border-radius:12px;padding:3px}.orderChoice button{border-radius:9px!important;border:0!important;color:#788179!important}.orderChoice button:hover{color:#dbe1db!important}
.rangePills,.dcaSubnav{gap:5px}.rangePills button{border:1px solid #252c26!important;background:#111512!important;color:#727b73!important;border-radius:12px!important}.rangePills .rangeActive{background:#f0f3ef!important;color:#0c0f0d!important;border-color:#f0f3ef!important}
.botAnalytics{gap:14px}.botStatsColumn>section,.botChartCard{background:#131714!important;border:1px solid #242a25!important;border-radius:20px!important}.botStatsColumn span,.botChartCard span{color:#747d75}.botStatsColumn strong{color:#edf1ed}.botChartCard button{border-radius:10px!important}
.dcaBuilderTop{margin-bottom:20px}.dcaBuilderTop h1{color:#f0f3ef!important;font-size:29px!important;letter-spacing:-.045em}.dcaBuilderTop p{color:#747d75!important}.dcaBuilderGrid{gap:14px!important}.dcaBuilderGrid>section,.dcaBuilderCard,.dcaConfigCard,.dcaOrderCard,.dcaConditionCard{background:#131714!important;border:1px solid #242a25!important;border-radius:22px!important;box-shadow:none!important}.dcaBuilderGrid h2,.dcaBuilderGrid h3,.dcaConfigCard h3,.dcaOrderCard h3{color:#e9ede9!important}.dcaStartButton{min-height:42px!important;border:1px solid #f0f3ef!important;background:#f0f3ef!important;color:#0c0f0d!important;border-radius:13px!important;font-weight:800!important}.dcaStartButton:hover{background:#dfe5df!important}.dcaPairPicker,.dcaPairPickerPanel,.dcaPairMenu{background:#151a16!important;border-color:#2a312b!important;border-radius:18px!important;box-shadow:0 22px 70px rgba(0,0,0,.4)!important}.dcaPairPicker button,.dcaPairMenu button{border-radius:11px!important}.dcaConditionRow,.conditionRow{background:#101411!important;border:1px solid #232a24!important;border-radius:16px!important}.dcaConditionRow:hover,.conditionRow:hover{border-color:#343d35!important}
.dcaDealsStats{gap:12px}.dcaDealsStats>section{background:#131714!important;border:1px solid #242a25!important;border-radius:20px!important;box-shadow:none!important}.dcaDealsTableCard{overflow:hidden}.dcaDealsTableCard table{border-collapse:separate;border-spacing:0;width:100%}.dcaDealsTableCard th{background:#101411!important;color:#69726a!important;font-size:9px!important;letter-spacing:.08em;text-transform:uppercase;border-color:#222823!important}.dcaDealsTableCard td{background:#131714!important;border-color:#222823!important;color:#aeb6af!important}.dcaDealRow:hover td{background:#171c18!important}.dealBotName,.dcaTradePairLink{color:#e8ece8!important}.dcaTradePairLink:hover{color:#b8f64a!important}.dcaTradeActionRow td{background:#101411!important}.dcaTradeActionRow button,.rowActions button{border:1px solid #2a312b!important;background:#171c18!important;border-radius:11px!important;color:#9da69e!important}.dcaTradeActionRow button:hover,.rowActions button:hover{background:#202621!important;color:#edf1ed!important}.dealProgress,.allocationBar{border-radius:999px!important}.dealProgress i{border-radius:999px!important}
.myBotsButton{border:1px solid #2a312b!important;background:#151a16!important;color:#aab3ab!important;border-radius:12px!important}.myBotsButton:hover{background:#1d231e!important;color:#edf1ed!important}.dcaBotLink{color:#edf1ed!important}.clickableBotRow:hover td{background:#171c18!important}.dcaBotDetailPage{color:#dbe1db}.dcaBotDetailPage h1,.dcaBotDetailPage h2,.dcaBotDetailPage h3{color:#edf1ed}.dcaBotDetailPage p,.dcaBotDetailPage small{color:#747d75}.dcaBotDetailPage button{border-radius:11px}
.dcaEditOverlay,.dcaAddFundsOverlay,.modalOverlay,.tradeChartOverlay{background:rgba(3,5,4,.78)!important;backdrop-filter:blur(8px)}.dcaEditModal,.dcaAddFundsModal,.modalCard,.tradeChartModal{background:#131714!important;border:1px solid #303830!important;border-radius:24px!important;box-shadow:0 30px 100px rgba(0,0,0,.55)!important;overflow:hidden}.tradeChartTopbar,.tradeChartToolbar{background:#111512!important;border-color:#242a25!important}.tradeChartBody{background:#0f1310!important}.tradeChartIntervalActive{color:#f0f3ef!important;border-bottom-color:#b8f64a!important}
.greenText{color:#65df87!important}.redText{color:#fb7185!important}.validation{color:#fb7185!important}.helperText,.bidAsk,.featureLabel{color:#747d75!important}
@media(max-width:1100px){.appShell{--sidebar:204px}.pageContent,.builderPage{padding:26px 24px 48px}.liveDashboardMetrics{grid-template-columns:repeat(2,minmax(0,1fr))}.liveDashboardMainGrid{grid-template-columns:1fr}.moduleCards{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:760px){.appShell{display:block;min-height:100vh}.topHeader{position:sticky;top:0;height:66px;padding:0 14px}.wordmark{width:auto}.wordmark strong{display:none}.accountSummary{display:none}.sidebarCollapse{display:none}.sidebar{position:sticky;top:66px;height:auto;min-height:0;border-right:0;border-bottom:1px solid #1d221e;display:block;overflow-x:auto;background:#0e120f}.nav{padding:7px 10px;display:flex;flex-direction:row;gap:5px;overflow-x:auto}.nav>button{min-width:max-content;height:40px;padding:0 11px}.nav>button>span{width:24px;height:24px}.dcaSubnav{display:flex;flex-direction:row;margin:0;padding:6px 10px 9px;border-left:0;gap:6px}.dcaSubnav button{white-space:nowrap}.main{overflow:visible}.searchStrip{padding:8px 14px}.pageContent,.builderPage{padding:22px 14px 42px}.pageHeading{align-items:flex-start}.pageHeading h1{font-size:25px}.primaryButton{height:38px}.liveDashboardMetrics,.moduleCards{grid-template-columns:1fr}.totalBalanceBody,.statisticsBody{grid-template-columns:1fr;justify-items:center}.exchangeStats{grid-template-columns:1fr}.dcaDealsStats{grid-template-columns:1fr!important}.dcaDealsTableCard{overflow-x:auto}.dcaDealsTableCard table{min-width:920px}.notice{top:78px;right:12px;left:12px;max-width:none}.dcaBuilderGrid{grid-template-columns:1fr!important}.tradeChartOverlay{padding:0!important}.tradeChartModal{border-radius:0!important;border:0!important}}
`;
}

fs.writeFileSync(cssPath, css);
console.log("Prepared Trading Automations v1.1: complete DCA functionality preserved; Thrwa-inspired design layer applied.");
