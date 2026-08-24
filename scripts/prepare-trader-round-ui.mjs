import fs from "node:fs";
import path from "node:path";

const cssPath = path.join(process.cwd(), "app/trader/trader.module.css");
let css = fs.readFileSync(cssPath, "utf8");

const marker = "/* Trading platform global roundness */";
if (!css.includes(marker)) {
  css += `
${marker}
.appShell{
  --radius-control:14px;
  --radius-panel:20px;
  --radius-large:24px;
  --radius-pill:999px;
}

/* Controls: intentionally very rounded */
.appShell button,
.appShell input,
.appShell select,
.appShell textarea,
.appShell kbd{
  border-radius:var(--radius-control)!important;
}

/* Small identity/status elements become pills/circles */
.appShell .toggle,
.appShell .hotBadge,
.appShell .helpDot,
.appShell .profileButton,
.appShell .allocationBar,
.appShell [class*="Badge"],
.appShell [class*="badge"],
.appShell [class*="Pill"],
.appShell [class*="pill"]{
  border-radius:var(--radius-pill)!important;
}

/* Main surfaces */
.appShell .card,
.appShell .moduleCard,
.appShell .accountBanner,
.appShell .exchangeCard,
.appShell .actionRequired,
.appShell .marketSelectors,
.appShell .smartPanel,
.appShell .quickTradePanel,
.appShell .sidebarPromo,
.appShell .notice,
.appShell .pairPickerDropdown,
.appShell .tradeEditorOverlay > div,
.appShell .smartTradeEditorModal,
.appShell [class*="Modal"],
.appShell [class*="modal"],
.appShell [class*="Dialog"],
.appShell [class*="dialog"],
.appShell [class*="Panel"],
.appShell [class*="panel"],
.appShell [class*="Card"],
.appShell [class*="card"],
.appShell [class*="Box"],
.appShell [class*="box"]{
  border-radius:var(--radius-panel)!important;
}

/* Larger containers and chart shells */
.appShell [class*="Chart"],
.appShell [class*="chart"],
.appShell [class*="Table"],
.appShell [class*="table"],
.appShell [class*="Filters"],
.appShell [class*="filters"],
.appShell [class*="Builder"],
.appShell [class*="builder"]{
  border-radius:var(--radius-large)!important;
}

/* Rounded navigation without allowing two connected items to look like one block */
.appShell .nav > button,
.appShell [class*="Tab"] button,
.appShell [class*="tab"] button{
  border-radius:16px!important;
}
.appShell .nav > button{
  margin:3px 10px;
  width:calc(100% - 20px);
}
.appShell .nav .navActive:before{
  border-radius:0 var(--radius-pill) var(--radius-pill) 0;
  top:9px;
  bottom:9px;
}

/* Inputs with embedded suffixes / segmented controls */
.appShell .inputUnit,
.appShell .stopPriceGrid,
.appShell .smallStepper,
.appShell .orderChoice,
.appShell .percentButtons,
.appShell [class*="Input"],
.appShell [class*="input"],
.appShell [class*="Choice"],
.appShell [class*="choice"],
.appShell [class*="Action"],
.appShell [class*="action"]{
  border-radius:16px!important;
}

/* Keep inner content clipped to the new curved edges where appropriate */
.appShell .card,
.appShell .smartPanel,
.appShell .quickTradePanel,
.appShell .exchangeCard,
.appShell .pairPickerDropdown,
.appShell .smartTradeEditorModal,
.appShell [class*="Modal"],
.appShell [class*="modal"],
.appShell [class*="Chart"],
.appShell [class*="chart"]{
  overflow:hidden;
}
`;
}

fs.writeFileSync(cssPath, css);
console.log("Applied very rounded styling across the LabNarrative trading platform.");
