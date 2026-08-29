import fs from "node:fs";
import path from "node:path";

const cssTarget = path.join(process.cwd(), "app", "trader", "portfolio-intelligence.module.css");
if (!fs.existsSync(cssTarget)) throw new Error("Portfolio popover CSS target missing");
let css = fs.readFileSync(cssTarget, "utf8");

if (!css.includes("PORTFOLIO BOT POPOVER ALIGNMENT V1")) {
  css += `
/* PORTFOLIO BOT POPOVER ALIGNMENT V1 */
.botScopeDropdown{position:relative!important;display:inline-flex;align-items:center;z-index:60}
.botScopeMenu{position:absolute!important;top:calc(100% + 8px)!important;left:0!important;right:auto!important;width:440px!important;max-width:calc(100vw - 350px)!important;max-height:min(540px,calc(100vh - 210px))!important;overflow:auto!important;margin:0!important;padding:10px!important;border:1px solid #3a3a3a!important;border-radius:13px!important;background:#202020!important;box-shadow:0 18px 48px rgba(0,0,0,.48)!important;z-index:1000!important;transform-origin:top left;animation:portfolioPopoverIn .16s cubic-bezier(.2,.8,.2,1)}
.botScopeMenu .botScope{grid-template-columns:1fr!important;gap:6px!important}
.botScopeMenu .botToggle{width:100%;min-width:0}
.botScopeMenuHead{padding:5px 3px 8px!important}
@keyframes portfolioPopoverIn{from{opacity:0;transform:translateY(-5px) scale(.985)}to{opacity:1;transform:translateY(0) scale(1)}}
@media(max-width:900px){.botScopeMenu{width:min(420px,calc(100vw - 32px))!important;max-width:calc(100vw - 32px)!important;left:0!important}}
@media(max-width:560px){.botScopeDropdown{width:100%}.botPositionsButton{width:100%}.botScopeMenu{width:calc(100vw - 28px)!important;max-width:calc(100vw - 28px)!important}}
`;
}

fs.writeFileSync(cssTarget, css);
console.log("Aligned Portfolio bot-position popover under its trigger.");

await import("./prepare-trader-dca-config-importer-v1.mjs");
await import("./prepare-trader-position-row-theme-v4.mjs");
