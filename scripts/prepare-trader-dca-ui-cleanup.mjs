import fs from "node:fs";
import path from "node:path";

const traderPath = path.join(process.cwd(), "app/trader/TradingAgent.tsx");
const cssPath = path.join(process.cwd(), "app/trader/trader.module.css");
let source = fs.readFileSync(traderPath, "utf8");
let css = fs.readFileSync(cssPath, "utf8");

// The DCA Bot parent item is the bot-list navigation. Remove the redundant My Bots child item.
source = source.replace(
  '<button className={section === "DCA bots" ? styles.navActive : ""} onClick={() => openSection("DCA bots")}><span>{navGlyph("DCA bots")}</span>DCA Bot<small>⌄</small></button>',
  '<button className={section === "DCA bots" ? styles.navActive : ""} onClick={() => { openSection("DCA bots"); setDcaView("list"); setSelectedBotId(null); window.history.pushState({}, "", "/trader"); }}><span>{navGlyph("DCA bots")}</span>DCA Bot<small>⌄</small></button>'
);
source = source.replace(
  '<div className={styles.dcaSubnav}><button className={dcaView === "list" || dcaView === "create" || dcaView === "detail" ? styles.dcaSubnavActive : ""} onClick={() => setDcaView("list")}>My Bots</button>',
  '<div className={styles.dcaSubnav}>'
);

// The parent DCA Bot item already returns to the bot list, so the trade ledger does not need a duplicate My Bots button.
source = source.replace(
  '<button className={styles.myBotsButton} onClick={() => setDcaView("list")}>▣ My Bots</button>',
  ''
);

// Remove the oversized decorative arrow and square from Active/Closed trade statistics.
source = source.replace('<div className={styles.dealStatIcon}>↗</div>', '');
source = source.replace('<i>▣</i>', '');

// Put each active trade's controls inside that trade's own table box instead of in a detached action strip below all trades.
if (!source.includes("dcaTradeActionRow")) {
  source = source.replace(
    'import { useEffect, useMemo, useState } from "react";',
    'import { Fragment, useEffect, useMemo, useState } from "react";'
  );

  const rowStartToken = 'return <tr key={trade.id} className={styles.dcaDealRow}>';
  const rowStart = source.indexOf(rowStartToken);
  const rowEndToken = '</tr>;';
  const rowEnd = rowStart >= 0 ? source.indexOf(rowEndToken, rowStart) : -1;
  if (rowStart >= 0 && rowEnd > rowStart) {
    const before = source.slice(0, rowStart);
    const rowBody = source.slice(rowStart + rowStartToken.length, rowEnd);
    const after = source.slice(rowEnd + rowEndToken.length);
    const replacement = 'return <Fragment key={trade.id}><tr className={`${styles.dcaDealRow} ${mode === "Active" ? styles.dcaDealRowWithActions : ""}`}>' + rowBody + '</tr>{mode === "Active" && <tr className={styles.dcaTradeActionRow}><td colSpan={7}><div className={styles.dcaTradeInlineActions}><button className={styles.dealCancelButton} onClick={() => closeDcaTrade(trade.id)}>⊘ Cancel</button><button onClick={() => closeDcaTrade(trade.id)}>◉ Close at market price</button><button onClick={() => loadDcaBotIntoEditor(trade.botId)}>✎ Edit</button><button className={styles.dealBlueButton} onClick={() => addFundsToDcaTrade(trade.id)}>＋$ Add funds</button><button className={styles.dealRefreshButton} onClick={() => setNotice("DCA trade refreshed from live Binance market data.")}>↻ Refresh</button></div></td></tr>}</Fragment>;';
    source = before + replacement + after;
  }
}

const detachedActions = '      {mode === "Active" && rows.length > 0 && <div className={styles.dcaDealActionsList}>';
const detachedStart = source.indexOf(detachedActions);
if (detachedStart >= 0) {
  const detachedEnd = source.indexOf('\n      </section>', detachedStart);
  if (detachedEnd > detachedStart) source = source.slice(0, detachedStart) + source.slice(detachedEnd);
}

if (!css.includes("/* DCA trade row action cleanup */")) {
  css += `
/* DCA trade row action cleanup */
.dcaTradesTop{justify-content:flex-end}
.dcaDealRowWithActions td{border-bottom:0!important;padding-bottom:8px!important}
.dcaTradeActionRow td{padding:0 12px 14px!important;border-bottom:1px solid #263a45!important;background:#14232c}
.dcaTradeInlineActions{display:flex;justify-content:center;align-items:center;flex-wrap:wrap;gap:0;padding-top:2px}
.dcaTradeInlineActions button{height:35px;border:1px solid #344955;background:#20313b;color:#becbd2;padding:0 12px;cursor:pointer}
@media(max-width:1100px){.dcaTradeInlineActions{justify-content:flex-start}.dcaTradeInlineActions button{flex:1 1 auto}}
`;
}

fs.writeFileSync(traderPath, source);
fs.writeFileSync(cssPath, css);
console.log("Cleaned DCA navigation, embedded trade actions in each row, and removed decorative trade-stat symbols.");
