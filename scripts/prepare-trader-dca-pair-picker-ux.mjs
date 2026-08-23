import fs from "node:fs";
import path from "node:path";

const traderPath = path.join(process.cwd(), "app/trader/TradingAgent.tsx");
const cssPath = path.join(process.cwd(), "app/trader/trader.module.css");
let source = fs.readFileSync(traderPath, "utf8");
let css = fs.readFileSync(cssPath, "utf8");

// All coins is a decisive selection: select the whole current universe and close the picker immediately.
source = source.replace(
  'onClick={() => { setDcaAllPairs((all) => !all); if (!dcaAllPairs) setDcaSelectedPairs([]); }}',
  'onClick={() => { setDcaAllPairs(true); setDcaSelectedPairs([]); setDcaPairSearch(""); setDcaPairsOpen(false); }}'
);

// Clearing the selection should also close the picker so the form stays visually stable.
source = source.replace(
  'onClick={() => { setDcaAllPairs(false); setDcaSelectedPairs([]); }}>Unselect all',
  'onClick={() => { setDcaAllPairs(false); setDcaSelectedPairs([]); setDcaPairSearch(""); setDcaPairsOpen(false); }}>Unselect all'
);

// Keep the pair menu visually detached from the form flow. It must overlay the next card, not stretch or clip Main.
if (!css.includes("DCA PAIR PICKER UX FIX")) {
  css += `

/* DCA PAIR PICKER UX FIX */
.dcaSection,
.dcaSectionBody,
.dcaTwoCol,
.dcaPairsField {
  overflow: visible !important;
}

.dcaPairsField {
  position: relative;
  z-index: 40;
}

.dcaPairsPicker {
  position: relative;
  width: 100%;
}

.dcaPairsTrigger {
  width: 100%;
  min-height: 42px;
}

.dcaPairsMenu {
  position: absolute !important;
  top: calc(100% + 6px) !important;
  left: 0 !important;
  right: 0 !important;
  width: 100% !important;
  max-height: min(430px, 58vh) !important;
  z-index: 1200 !important;
  margin: 0 !important;
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.46);
}

.dcaPairsList {
  max-height: min(300px, 40vh) !important;
  overflow-y: auto !important;
  overscroll-behavior: contain;
}

.dcaPairsSearch {
  position: sticky;
  top: 0;
  z-index: 2;
}

.dcaPairsFooter {
  position: sticky;
  bottom: 0;
  z-index: 2;
}

@media (max-width: 900px) {
  .dcaPairsMenu {
    max-height: 52vh !important;
  }
}
`;
}

fs.writeFileSync(traderPath, source);
fs.writeFileSync(cssPath, css);
console.log("Fixed DCA pair picker overlay layout and All coins close behavior.");
