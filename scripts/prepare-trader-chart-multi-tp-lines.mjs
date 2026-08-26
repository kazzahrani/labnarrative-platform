import fs from "node:fs";

const file = "app/trader/DcaTradeChartV2Workstation.tsx";
let source = fs.readFileSync(file, "utf8");

const replaceOnce = (from, to, label) => {
  if (source.includes(to)) return;
  if (!source.includes(from)) throw new Error(`multi TP chart patch missing: ${label}`);
  source = source.replace(from, to);
};

replaceOnce(
  `  takeProfitPrice: number | null;\n  stopEnabled: boolean;`,
  `  takeProfitPrice: number | null;\n  takeProfitTargets: Array<{ index: number; profitPct: number; allocationPct: number; price: number }>;\n  stopEnabled: boolean;`,
  "ChartTrade.takeProfitTargets",
);

replaceOnce(
  `    quantity: 0, invested: 0, takeProfitPct: 0, takeProfitPrice: props.takeProfitPrice ?? null,\n    stopEnabled: Boolean(props.stopLossPrice),`,
  `    quantity: 0, invested: 0, takeProfitPct: 0, takeProfitPrice: props.takeProfitPrice ?? null, takeProfitTargets: [],\n    stopEnabled: Boolean(props.stopLossPrice),`,
  "fallback trade targets",
);

replaceOnce(
  `  const pendingExits = activeOrders.filter(o => o.side.toUpperCase() === "SELL" && o.price != null).sort((a, b) => a.sequence - b.sequence);\n  const symbol = trade.pair.replace("/", "");`,
  `  const pendingExits = activeOrders.filter(o => o.side.toUpperCase() === "SELL" && o.price != null).sort((a, b) => a.sequence - b.sequence);\n  const derivedTpTargets: ActiveOrder[] = (trade.takeProfitTargets ?? [])\n    .filter(target => Number.isFinite(target.price) && target.price > 0)\n    .map((target, index) => ({ id: \`derived-tp-\${target.index || index + 1}\`, kind: "take_profit", side: "SELL", status: "DERIVED", sequence: target.index || index + 1, price: target.price, amount: trade.invested * target.allocationPct / 100 }));\n  const plottedTpOrders: ActiveOrder[] = derivedTpTargets.length\n    ? derivedTpTargets\n    : pendingExits.length\n      ? pendingExits\n      : trade.takeProfitPrice && trade.takeProfitPrice > 0\n        ? [{ id: "derived-tp", kind: "take_profit", side: "SELL", status: "DERIVED", sequence: 1, price: trade.takeProfitPrice, amount: trade.invested }]\n        : [];\n  const symbol = trade.pair.replace("/", "");`,
  "derived multi TP levels",
);

replaceOnce(
  `    avg: trade.averagePrice, tp: trade.takeProfitPrice, sl: trade.stopLossPrice, exit: trade.exitPrice,\n  }), [fills, activeOrders, trade.averagePrice, trade.takeProfitPrice, trade.stopLossPrice, trade.exitPrice]);`,
  `    avg: trade.averagePrice, tp: trade.takeProfitPrice, tpTargets: trade.takeProfitTargets, sl: trade.stopLossPrice, exit: trade.exitPrice,\n  }), [fills, activeOrders, trade.averagePrice, trade.takeProfitPrice, trade.takeProfitTargets, trade.stopLossPrice, trade.exitPrice]);`,
  "chart structure signature",
);

replaceOnce(
  `    const tpPrices = pendingExits.length ? pendingExits : trade.takeProfitPrice ? [{ id: "derived-tp", kind: "take_profit", side: "SELL", status: "DERIVED", sequence: 1, price: trade.takeProfitPrice, amount: trade.invested }] : [];\n    tpPrices.forEach((order, index) => order.price && candleSeries.createPriceLine({ price: order.price, color: "#57c99c", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: tpPrices.length > 1 ? \`TP \${index + 1}\` : "TP" }));`,
  `    const tpPrices = plottedTpOrders;\n    tpPrices.forEach((order, index) => order.price && candleSeries.createPriceLine({ price: order.price, color: "#57c99c", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: tpPrices.length > 1 ? \`TP\${order.sequence || index + 1}\` : "TP" }));`,
  "multi TP price lines",
);

const oldStrip = `        {(pendingExits.length ? pendingExits : trade.takeProfitPrice ? [{id:"tp",price:trade.takeProfitPrice,sequence:1,amount:0,kind:"",side:"",status:""}] : []).map((order, i) => <span className={styles.tp} key={order.id}>TP{pendingExits.length > 1 ? \` \${i+1}\` : ""} {formatPrice(order.price)}</span>)}`;
const newStrip = `        {plottedTpOrders.map((order, i) => <span className={styles.tp} key={order.id}>TP{plottedTpOrders.length > 1 ? \`\${order.sequence || i + 1}\` : ""} {formatPrice(order.price)}</span>)}`;
if (source.includes(oldStrip)) source = source.replace(oldStrip, newStrip);

fs.writeFileSync(file, source);
console.log("Trade chart multi TP lines prepared");
