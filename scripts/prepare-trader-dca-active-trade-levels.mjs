import fs from "node:fs";
import path from "node:path";

const traderPath = path.join(process.cwd(), "app/trader/TradingAgent.tsx");
const cssPath = path.join(process.cwd(), "app/trader/trader.module.css");
let source = fs.readFileSync(traderPath, "utf8");
let css = fs.readFileSync(cssPath, "utf8");

// Bot names in the DCA trade ledger should navigate to the corresponding bot detail page.
source = source.replace(
  '<strong className={styles.dealBotName}>{trade.botName}</strong>',
  '<button type="button" className={styles.dealBotLink} onClick={() => openDcaBot(trade.botId)}>{trade.botName}</button>'
);

// Show live TP, SL, and next DCA order levels directly in every active-trade row.
const oldProgress = '{mode === "Active" && <div className={styles.dealProgress}><i style={{ width: progressWidth }}/><span>Buy {money(trade.averagePrice)}</span><em>MP {money(current)}</em></div>}';
const newProgress = `{mode === "Active" && (() => {
  const tradeBot = dcaBots.find((bot) => bot.id === trade.botId);
  const tpLevel = tradeBot?.takeProfit ? trade.averagePrice * (1 + tradeBot.takeProfit / 100) : null;
  const slLevel = tradeBot?.stopEnabled ? trade.averagePrice * (1 - tradeBot.stopPct / 100) : null;
  let nextDcaLevel: number | null = null;
  if (tradeBot && trade.averagingFilled < trade.maxAveraging) {
    let cumulativeDeviation = 0;
    let nextStep = tradeBot.deviation;
    for (let index = 0; index <= trade.averagingFilled; index += 1) {
      cumulativeDeviation += nextStep;
      nextStep *= tradeBot.stepScale;
    }
    nextDcaLevel = trade.entryPrice * (1 - cumulativeDeviation / 100);
  }
  return <div className={styles.dealTradeSnapshot}>
    <div className={styles.dealProgress}><i style={{ width: progressWidth }}/><span>Buy {money(trade.averagePrice)}</span><em>MP {money(current)}</em></div>
    <div className={styles.dealOrderLevels}>
      <span className={styles.dealTpLevel}><b>TP</b>{tpLevel ? money(tpLevel) : "—"}</span>
      <span className={styles.dealSlLevel}><b>SL</b>{slLevel ? money(slLevel) : "Off"}</span>
      <span className={styles.dealDcaLevel}><b>Next DCA</b>{nextDcaLevel ? money(nextDcaLevel) : "Complete"}</span>
    </div>
  </div>;
})()}`;
source = source.replace(oldProgress, newProgress);

if (!css.includes("/* DCA active trade level strip */")) {
  css += `
/* DCA active trade level strip */
.dealBotLink{appearance:none;border:0;background:transparent;color:#48aefc;font:inherit;font-weight:800;padding:0;cursor:pointer;text-align:left;display:block}
.dealBotLink:hover{text-decoration:underline;color:#77c5ff}
.dealTradeSnapshot{margin-top:7px;min-width:300px}
.dealOrderLevels{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-top:7px;font-size:10px;line-height:1}
.dealOrderLevels span{display:inline-flex;align-items:center;gap:5px;border:1px solid #314754;background:#10202a;border-radius:3px;padding:5px 7px;color:#aebdc7;white-space:nowrap}
.dealOrderLevels b{font-size:9px;letter-spacing:.25px}
.dealTpLevel b{color:#18c8aa}.dealTpLevel{border-color:rgba(24,200,170,.3)!important}
.dealSlLevel b{color:#ff7087}.dealSlLevel{border-color:rgba(255,112,135,.3)!important}
.dealDcaLevel b{color:#4aa7f7}.dealDcaLevel{border-color:rgba(74,167,247,.3)!important}
.dcaDealsTableCard th:nth-child(3),.dcaDealsTableCard td:nth-child(3){min-width:320px}
@media(max-width:1100px){.dealTradeSnapshot{min-width:260px}.dealOrderLevels{gap:5px}.dealOrderLevels span{padding:4px 6px}}
`;
}

fs.writeFileSync(traderPath, source);
fs.writeFileSync(cssPath, css);
console.log("Linked DCA trade bot names to bot details and added live TP/SL/next-DCA levels to active trades.");
