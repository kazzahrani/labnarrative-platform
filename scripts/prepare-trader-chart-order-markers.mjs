import fs from "node:fs";
import path from "node:path";

const chartPath = path.join(process.cwd(), "app/trader/DcaTradeChartV2Workstation.tsx");
let source = fs.readFileSync(chartPath, "utf8");

if (source.includes("TRADER_CHART_ORDER_MARKERS_V1")) {
  console.log("Trade chart order markers already prepared.");
  process.exit(0);
}

const fillAnchor = 'type Fill = {\n  kind: string;';
if (!source.includes(fillAnchor)) throw new Error("Order markers: Fill type anchor missing");
source = source.replace(fillAnchor, 'type Fill = {\n  orderId?: string | null; // TRADER_CHART_ORDER_MARKERS_V1\n  kind: string;');

const markerStart = source.indexOf('    const markers: SeriesMarker<UTCTimestamp>[] = fills.flatMap');
const markerEnd = source.indexOf('    if (trade.status === "Closed"', markerStart);
if (markerStart < 0 || markerEnd < 0) throw new Error("Order markers: marker block missing");

const replacement = `    const groupedBuyOrders = Array.from(fills
      .filter((fill) => (fill.side ?? "BUY").toUpperCase() === "BUY")
      .reduce((groups, fill) => {
        const key = fill.orderId || \`legacy|\${fill.kind}|\${fill.at}\`;
        if (!groups.has(key)) groups.set(key, fill);
        return groups;
      }, new Map<string, Fill>()).values());
    let dcaMarkerNumber = 0;
    const markers: SeriesMarker<UTCTimestamp>[] = groupedBuyOrders.flatMap((fill) => {
      const time = nearestCandleTime(candles, new Date(fill.at).getTime());
      if (!time) return [];
      const kind = fill.kind.toLowerCase();
      const text = kind.includes("base") ? "BUY" : kind.includes("averag") ? \`DCA \${++dcaMarkerNumber}\` : kind.includes("add") ? "ADD" : "BUY";
      return [{ time, position: "belowBar", color: "#46d7a2", shape: "arrowUp", text }];
    });
`;

source = source.slice(0, markerStart) + replacement + source.slice(markerEnd);
fs.writeFileSync(chartPath, source);
console.log("Trade chart markers grouped by actual order");
