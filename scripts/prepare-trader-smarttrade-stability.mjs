import fs from "node:fs";
import path from "node:path";

const traderPath = path.join(process.cwd(), "app/trader/TradingAgent.tsx");
let source = fs.readFileSync(traderPath, "utf8");

// IMPORTANT: These helpers are declared inside TradingAgent because they need access
// to its state. Rendering them with <Helper /> makes React see a brand-new component
// type on every TradingAgent render. Live Binance ticks and every parent setState then
// unmount/remount the subtree, which closes PairPicker and resets NumericInput drafts.
// Render them as plain render-helper functions instead so top-level stateful children
// (PairPicker / NumericInput) keep their identity and local state.
const replacements = [
  ["<BalanceChart/>", "{BalanceChart()}"],
  ["<OrdersTable/>", "{OrdersTable({})}"],
  ["<OrdersTable compact/>", "{OrdersTable({ compact: true })}"],
  ["<UtilityBar/>", "{UtilityBar()}"],
  ["<Selectors/>", "{Selectors()}"],
  ["<ModeTabs/>", "{ModeTabs()}"],
  ["<SmartBuilder/>", "{SmartBuilder()}"],
  ["<BuySellPanel side=\"Buy\"/>", "{BuySellPanel({ side: \"Buy\" })}"],
  ["<BuySellPanel side=\"Sell\"/>", "{BuySellPanel({ side: \"Sell\" })}"],
];

for (const [before, after] of replacements) {
  source = source.replaceAll(before, after);
}

// Make pair selection happen on pointer-down, before focus can move and before a
// concurrent market tick has any chance to interfere with the click sequence.
source = source.replace(
  'onClick={() => choose(market.symbol)}>',
  'onPointerDown={(event) => { event.preventDefault(); choose(market.symbol); }}>'
);

// While the user is editing any form control, do not push live bookTicker updates
// into the parent form tree. The socket remains connected; UI catches up immediately
// after focus leaves the control. miniTicker updates are also skipped during editing.
source = source.replace(
  '      socket.onmessage = (event) => {\n        try {',
  '      socket.onmessage = (event) => {\n        try {\n          const active = document.activeElement as HTMLElement | null;\n          if (active && (active.tagName === "INPUT" || active.tagName === "SELECT" || active.tagName === "TEXTAREA")) return;'
);

fs.writeFileSync(traderPath, source);
console.log("Prepared stable SmartTrade render tree: no nested-component remounts during typing or pair search.");
