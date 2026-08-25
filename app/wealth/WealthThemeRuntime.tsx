"use client";

import { useEffect } from "react";

const LIGHT_THEME_CSS = `
html[data-wealth-theme="light"] .wealth-tahoma,
html[data-wealth-theme="light"] .wealth-tahoma main,
html[data-wealth-theme="light"] .wealth-tahoma [class*="page"] {
  background:#f4f3ef !important;
  color:#202020 !important;
}
html[data-wealth-theme="light"] .wealth-tahoma aside[class*="sidebar"],
html[data-wealth-theme="light"] .wealth-tahoma header[class*="topbar"] {
  background:#f4f3ef !important;
  color:#202020 !important;
  border-color:#d9d7d1 !important;
}
html[data-wealth-theme="light"] .wealth-tahoma article,
html[data-wealth-theme="light"] .wealth-tahoma [class*="Card"],
html[data-wealth-theme="light"] .wealth-tahoma [class*="card"],
html[data-wealth-theme="light"] .wealth-tahoma [class*="Panel"],
html[data-wealth-theme="light"] .wealth-tahoma [class*="panel"],
html[data-wealth-theme="light"] .wealth-tahoma [class*="History"],
html[data-wealth-theme="light"] .wealth-tahoma [class*="history"],
html[data-wealth-theme="light"] .wealth-tahoma [class*="Notice"],
html[data-wealth-theme="light"] .wealth-tahoma [class*="notice"],
html[data-wealth-theme="light"] .wealth-tahoma [class*="Note"],
html[data-wealth-theme="light"] .wealth-tahoma [class*="note"] {
  background:#fff !important;
  border-color:#dedcd6 !important;
  color:#202020 !important;
  box-shadow:none !important;
}
html[data-wealth-theme="light"] .wealth-tahoma [class*="performancePanel"],
html[data-wealth-theme="light"] .wealth-tahoma [class*="chartCard"],
html[data-wealth-theme="light"] .wealth-tahoma [class*="chartWrap"],
html[data-wealth-theme="light"] .wealth-tahoma [class*="summary"] > div,
html[data-wealth-theme="light"] .wealth-tahoma [class*="donutCenter"],
html[data-wealth-theme="light"] .wealth-tahoma [class*="center"] {
  background:#f8f7f4 !important;
  border-color:#dedcd6 !important;
  color:#202020 !important;
  box-shadow:none !important;
}
html[data-wealth-theme="light"] .wealth-tahoma [class*="performancePanel"] {
  background:#fff !important;
}
html[data-wealth-theme="light"] .wealth-tahoma [class*="barTrack"],
html[data-wealth-theme="light"] .wealth-tahoma [class*="weightBar"],
html[data-wealth-theme="light"] .wealth-tahoma [class*="bigBars"] section > div {
  background:#ebe9e4 !important;
  border-color:#ddd9d1 !important;
}
html[data-wealth-theme="light"] .wealth-tahoma [class*="ranges"] button {
  background:#fff !important;
  color:#6d6a65 !important;
  border-color:#cfccc5 !important;
}
html[data-wealth-theme="light"] .wealth-tahoma [class*="ranges"] button:hover,
html[data-wealth-theme="light"] .wealth-tahoma [class*="ranges"] button[class*="active"],
html[data-wealth-theme="light"] .wealth-tahoma [class*="ranges"] [class*="rangeActive"] {
  background:#242424 !important;
  color:#fafafa !important;
  border-color:#242424 !important;
}
html[data-wealth-theme="light"] .wealth-tahoma [class*="state"] {
  grid-column:1 / -1 !important;
  width:100% !important;
  min-width:100% !important;
  background:#f4f3ef !important;
  color:#6d6d69 !important;
}
html[data-wealth-theme="light"] .wealth-tahoma [class*="state"] strong { color:#202020 !important; }
html[data-wealth-theme="light"] .wealth-tahoma [class*="row"]:not([class*="headRow"]):hover,
html[data-wealth-theme="light"] .wealth-tahoma [class*="Row"]:not([class*="HeadRow"]):hover,
html[data-wealth-theme="light"] .wealth-tahoma [class*="legend"] button:hover {
  background:#f0eee9 !important;
}
html[data-wealth-theme="light"] .wealth-tahoma [class*="gridLine"] { stroke:#dedbd4 !important; }
html[data-wealth-theme="light"] .wealth-tahoma [class*="cursorLine"],
html[data-wealth-theme="light"] .wealth-tahoma [class*="cursor"] { stroke:#aaa69e !important; }
html[data-wealth-theme="light"] .wealth-tahoma [class*="track"] { stroke:#e2dfd8 !important; }
html[data-wealth-theme="light"] .wealth-tahoma [class*="pointProfit"],
html[data-wealth-theme="light"] .wealth-tahoma [class*="pointLoss"] { stroke:#f8f7f4 !important; }
html[data-wealth-theme="light"] .wealth-tahoma [class*="sourceNote"],
html[data-wealth-theme="light"] .wealth-tahoma [class*="methodNote"],
html[data-wealth-theme="light"] .wealth-tahoma [class*="paperNote"],
html[data-wealth-theme="light"] .wealth-tahoma [class*="footerNote"] {
  background:#fff !important;
  color:#6d6d69 !important;
  border-color:#dedcd6 !important;
}
html[data-wealth-theme="light"] .wealth-tahoma [class*="details"] > div,
html[data-wealth-theme="light"] .wealth-tahoma [class*="rankList"] > div,
html[data-wealth-theme="light"] .wealth-tahoma [class*="methodList"] > div,
html[data-wealth-theme="light"] .wealth-tahoma [class*="exposureRows"] > div,
html[data-wealth-theme="light"] .wealth-tahoma [class*="row"] {
  border-color:#e2e0da !important;
}
html[data-wealth-theme="light"] .wealth-tahoma [class*="chartLoading"],
html[data-wealth-theme="light"] .wealth-tahoma [class*="empty"] {
  background:#f8f7f4 !important;
  color:#76736e !important;
  border-color:#d9d6cf !important;
}
`;

export default function WealthThemeRuntime() {
  useEffect(() => {
    const id = "wealth-light-runtime-overrides";
    let style = document.getElementById(id) as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement("style");
      style.id = id;
      document.head.appendChild(style);
    }
    style.textContent = LIGHT_THEME_CSS;
    return () => style?.remove();
  }, []);
  return null;
}
