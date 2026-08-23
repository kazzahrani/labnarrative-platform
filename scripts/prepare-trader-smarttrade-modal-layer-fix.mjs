import fs from "node:fs";
import path from "node:path";

const traderPath = path.join(process.cwd(), "app/trader/TradingAgent.tsx");
const cssPath = path.join(process.cwd(), "app/trader/trader.module.css");
let source = fs.readFileSync(traderPath, "utf8");
let css = fs.readFileSync(cssPath, "utf8");

// SMARTTRADE MODAL LAYER FIX V1
// SmartTrade editor/add-funds/chart state must never survive navigation to another workspace.
const outerReturnToken = '  return <main className={styles.appShell}>';
const outerReturnIndex = source.lastIndexOf(outerReturnToken);
if (outerReturnIndex < 0) throw new Error("Could not locate TradingAgent outer return for SmartTrade modal layer fix.");

if (!source.includes("// SMARTTRADE MODAL NAVIGATION CLEANUP V1")) {
  const cleanup = [
    "  // SMARTTRADE MODAL NAVIGATION CLEANUP V1",
    "  useEffect(() => {",
    "    setEditingSmartTradeId(null);",
    "    setSmartEditDraft(null);",
    "    setSmartAddFundsTradeId(null);",
    "    setSelectedSmartTradeChartId(null);",
    "  }, [section, smartTab, smartView, dcaView]);",
    "",
    "  useEffect(() => {",
    "    const modalOpen = Boolean(editingSmartTradeId || smartAddFundsTradeId || selectedSmartTradeChartId);",
    "    if (!modalOpen) return;",
    "    const previousOverflow = document.body.style.overflow;",
    "    document.body.style.overflow = \"hidden\";",
    "    const onKeyDown = (event: KeyboardEvent) => {",
    "      if (event.key !== \"Escape\") return;",
    "      setEditingSmartTradeId(null);",
    "      setSmartEditDraft(null);",
    "      setSmartAddFundsTradeId(null);",
    "      setSelectedSmartTradeChartId(null);",
    "    };",
    "    document.addEventListener(\"keydown\", onKeyDown);",
    "    return () => {",
    "      document.body.style.overflow = previousOverflow;",
    "      document.removeEventListener(\"keydown\", onKeyDown);",
    "    };",
    "  }, [editingSmartTradeId, smartAddFundsTradeId, selectedSmartTradeChartId]);",
    "",
  ].join("\n");
  source = source.slice(0, outerReturnIndex) + cleanup + source.slice(outerReturnIndex);
}

// Do not render SmartTrade overlays outside the SmartTrade workspace even for one frame.
source = source.replace(
  '{selectedSmartChartTrade && <DcaTradeChart',
  '{section === "Smart Trades" && selectedSmartChartTrade && <DcaTradeChart'
);
source = source.replace(
  '{editingSmartTrade && smartEditDraft && <div className={styles.tradeEditorOverlay}',
  '{section === "Smart Trades" && editingSmartTrade && smartEditDraft && <div className={styles.tradeEditorOverlay}'
);
source = source.replace(
  '{smartAddFundsTrade && <div className={styles.tradeEditorOverlay}',
  '{section === "Smart Trades" && smartAddFundsTrade && <div className={styles.tradeEditorOverlay}'
);

if (!css.includes("/* SmartTrade fixed modal layer */")) {
  css += `
/* SmartTrade fixed modal layer */
.tradeEditorOverlay{
  position:fixed!important;
  inset:0!important;
  width:100vw!important;
  height:100dvh!important;
  z-index:100000!important;
  display:flex!important;
  align-items:center!important;
  justify-content:center!important;
  padding:24px!important;
  margin:0!important;
  background:rgba(4,12,17,.72)!important;
  backdrop-filter:blur(2px);
  overflow:auto!important;
  overscroll-behavior:contain;
}
.tradeEditorOverlay>.smartTradeEditorModal,
.smartTradeEditorModal{
  position:relative!important;
  inset:auto!important;
  transform:none!important;
  width:min(620px,calc(100vw - 32px))!important;
  max-width:620px!important;
  max-height:calc(100dvh - 48px)!important;
  margin:auto!important;
  overflow:auto!important;
  border-radius:8px!important;
  box-shadow:0 28px 80px rgba(0,0,0,.58)!important;
}
.tradeEditorOverlay .smartTradeModalHead{
  position:sticky;
  top:0;
  z-index:5;
  background:#182934;
}
.tradeEditorOverlay .smartTradeModalFooter{
  position:sticky;
  bottom:0;
  z-index:5;
  background:#182934;
}
@media(max-width:700px){
  .tradeEditorOverlay{padding:10px!important;align-items:flex-start!important;}
  .tradeEditorOverlay>.smartTradeEditorModal,.smartTradeEditorModal{width:100%!important;max-height:calc(100dvh - 20px)!important;}
}
`;
}

if (!source.includes('section === "Smart Trades" && editingSmartTrade')) throw new Error("SmartTrade editor workspace guard missing.");
if (!source.includes('section === "Smart Trades" && smartAddFundsTrade')) throw new Error("SmartTrade add-funds workspace guard missing.");
if (!source.includes("SMARTTRADE MODAL NAVIGATION CLEANUP V1")) throw new Error("SmartTrade modal navigation cleanup missing.");
if (!css.includes("position:fixed!important")) throw new Error("SmartTrade modal fixed viewport CSS missing.");

fs.writeFileSync(traderPath, source);
fs.writeFileSync(cssPath, css);
console.log("Centered SmartTrade modals in a fixed viewport layer and cleared them on navigation.");
