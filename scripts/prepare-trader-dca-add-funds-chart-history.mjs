import fs from "node:fs";
import path from "node:path";

const traderPath = path.join(process.cwd(), "app/trader/TradingAgent.tsx");
const chartPath = path.join(process.cwd(), "app/trader/DcaTradeChart.tsx");
let source = fs.readFileSync(traderPath, "utf8");
let chart = fs.readFileSync(chartPath, "utf8");

// Add Funds is a distinct execution event. It must not consume a DCA/averaging slot.
source = source.replaceAll(
  'kind: "Base" | "Averaging";',
  'kind: "Base" | "Averaging" | "Add Funds";'
);
source = source.replaceAll(
  'kind: "Base" | "Averaging"; price:',
  'kind: "Base" | "Averaging" | "Add Funds"; price:'
);

chart = chart.replace(
  'kind: "Base" | "Averaging";',
  'kind: "Base" | "Averaging" | "Add Funds";'
);

// Persist the exact Add Funds fill (execution price, quote amount, base quantity and timestamp).
const oldSaveBlock = [
  '    setDcaTrades((items) => items.map((item) => {',
  '      if (item.id !== trade.id || item.status !== "Active") return item;',
  '      const extraQty = amount / executionPrice;',
  '      const newQty = item.quantity + extraQty;',
  '      const newInvested = item.invested + amount;',
  '      return { ...item, quantity: newQty, invested: newInvested, averagePrice: newInvested / newQty, lastPrice: dcaTradePrice(item) };',
  '    }));',
].join("\n");
const newSaveBlock = [
  '    const addFundsFilledAt = new Date().toISOString();',
  '    setDcaTrades((items) => items.map((item) => {',
  '      if (item.id !== trade.id || item.status !== "Active") return item;',
  '      const extraQty = amount / executionPrice;',
  '      const newQty = item.quantity + extraQty;',
  '      const newInvested = item.invested + amount;',
  '      const priorFills = item.fills ?? [{ kind: "Base" as const, price: item.entryPrice, amount: 0, quantity: 0, at: item.createdAt }];',
  '      return {',
  '        ...item,',
  '        quantity: newQty,',
  '        invested: newInvested,',
  '        averagePrice: newInvested / newQty,',
  '        lastPrice: dcaTradePrice(item),',
  '        fills: [...priorFills, { kind: "Add Funds" as const, price: executionPrice, amount, quantity: extraQty, at: addFundsFilledAt }],',
  '      };',
  '    }));',
].join("\n");
if (!source.includes('kind: "Add Funds" as const')) source = source.replace(oldSaveBlock, newSaveBlock);

// Render Add Funds separately from automatic DCA fills and keep DCA numbering correct.
const oldMarkerBlock = `    const markers: SeriesMarker<UTCTimestamp>[] = chartFills.flatMap((fill, index) => {
      const time = nearestCandleTime(candles, new Date(fill.at).getTime());
      if (!time) return [];
      return [{
        time,
        position: "belowBar",
        color: "#11d7c0",
        shape: "arrowUp",
        text: fill.kind === "Base" ? "BUY" : \`DCA \${index}\`,
      }];
    });`;
const newMarkerBlock = `    const markers: SeriesMarker<UTCTimestamp>[] = chartFills.flatMap((fill, index) => {
      const time = nearestCandleTime(candles, new Date(fill.at).getTime());
      if (!time) return [];
      const dcaSequence = chartFills.slice(0, index + 1).filter((item) => item.kind === "Averaging").length;
      return [{
        time,
        position: "belowBar",
        color: fill.kind === "Add Funds" ? "#4aa9ef" : "#11d7c0",
        shape: "arrowUp",
        text: fill.kind === "Base" ? "BUY" : fill.kind === "Add Funds" ? "ADD" : \`DCA \${dcaSequence}\`,
      }];
    });`;
chart = chart.replace(oldMarkerBlock, newMarkerBlock);

if (!source.includes('kind: "Add Funds" as const')) throw new Error("Add Funds execution was not added to DCA fill history.");
if (!chart.includes('fill.kind === "Add Funds" ? "ADD"')) throw new Error("DCA chart ADD marker patch failed.");
if (!chart.includes('kind: "Base" | "Averaging" | "Add Funds"')) throw new Error("DCA chart Fill type was not extended.");

fs.writeFileSync(traderPath, source);
fs.writeFileSync(chartPath, chart);
console.log("Recorded Add Funds as exact DCA trade fills and rendered ADD markers on the trade chart.");
