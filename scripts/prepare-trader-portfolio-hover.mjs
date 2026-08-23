import fs from "node:fs";
import path from "node:path";

const traderPath = path.join(process.cwd(), "app/trader/TradingAgent.tsx");
const cssPath = path.join(process.cwd(), "app/trader/trader.module.css");
let source = fs.readFileSync(traderPath, "utf8");
let css = fs.readFileSync(cssPath, "utf8");

const hoverAnchor = '  const portfolioAssetCount = portfolioHoldings.filter((holding) => holding.symbol !== "USDT").length;';
if (source.includes(hoverAnchor) && !source.includes('PORTFOLIO DONUT HOVER V1')) {
  const hoverBlock = [
    hoverAnchor,
    '  // PORTFOLIO DONUT HOVER V1 — resolve the exact allocation slice under the pointer.',
    '  const [portfolioHoverSymbol, setPortfolioHoverSymbol] = useState<string | null>(null);',
    '  const portfolioHoverHolding = portfolioHoverSymbol ? (portfolioHoldings.find((holding) => holding.symbol === portfolioHoverSymbol) ?? null) : null;',
    '  const portfolioAssetName = (symbol: string) => ({ BTC: "Bitcoin", ETH: "Ethereum", BNB: "BNB", SOL: "Solana", SUI: "Sui", XRP: "XRP", ADA: "Cardano", DOGE: "Dogecoin", TRX: "TRON", USDT: "Tether", USDC: "USD Coin" }[symbol] ?? symbol);',
    '  const handlePortfolioDonutMove = (event: any) => {',
    '    const rect = event.currentTarget.getBoundingClientRect();',
    '    const dx = event.clientX - (rect.left + rect.width / 2);',
    '    const dy = event.clientY - (rect.top + rect.height / 2);',
    '    const radius = Math.sqrt(dx * dx + dy * dy);',
    '    const outer = Math.min(rect.width, rect.height) / 2;',
    '    if (radius < outer * 0.56 || radius > outer * 1.04) { setPortfolioHoverSymbol(null); return; }',
    '    const angle = (Math.atan2(dy, dx) * 180 / Math.PI + 450) % 360;',
    '    const point = angle / 360 * 100;',
    '    let cursor = 0;',
    '    const match = portfolioHoldings.find((holding) => { const start = cursor; cursor += holding.percent; return point >= start && point < cursor; });',
    '    setPortfolioHoverSymbol(match?.symbol ?? null);',
    '  };',
  ].join('\n');
  source = source.replace(hoverAnchor, hoverBlock);
}

const portfolioOld = '<div className={styles.livePortfolioDonut} style={{ background: portfolioGradient }}><div className={styles.livePortfolioDonutInner}><span>Assets</span><strong>{portfolioAssetCount}</strong><small>{portfolioHoldings.length} incl. cash</small></div></div>';
const portfolioNew = '<div className={styles.portfolioDonutHoverWrap}><div className={styles.livePortfolioDonut} style={{ background: portfolioGradient }} onMouseMove={handlePortfolioDonutMove} onMouseLeave={() => setPortfolioHoverSymbol(null)}><div className={styles.livePortfolioDonutInner}><span>Assets</span><strong>{portfolioAssetCount}</strong><small>{portfolioHoldings.length} incl. cash</small></div></div>{portfolioHoverHolding && <div className={styles.portfolioDonutTooltip}><strong>{portfolioAssetName(portfolioHoverHolding.symbol)} ({portfolioHoverHolding.symbol})</strong><div><span>Percentage</span><b>{portfolioHoverHolding.percent.toFixed(2)}%</b></div><div><span>Amount</span><b>{portfolioHoverHolding.symbol === "USDT" ? portfolioHoverHolding.quantity.toFixed(2) : portfolioHoverHolding.quantity.toLocaleString("en-US", { maximumFractionDigits: 8 })}</b></div><div><span>Total</span><b>{compactMoney(portfolioHoverHolding.value)}</b></div></div>}</div>';
if (source.includes(portfolioOld)) source = source.replace(portfolioOld, portfolioNew);

const dashboardOld = '<div className={styles.liveDashboardDonut} style={{ background: portfolioGradient }}><div><span>Equity</span><strong>{compactMoney(accountValue)}</strong><small>{portfolioAssetCount} assets</small></div></div>';
const dashboardNew = '<div className={styles.portfolioDonutHoverWrap}><div className={styles.liveDashboardDonut} style={{ background: portfolioGradient }} onMouseMove={handlePortfolioDonutMove} onMouseLeave={() => setPortfolioHoverSymbol(null)}><div><span>Equity</span><strong>{compactMoney(accountValue)}</strong><small>{portfolioAssetCount} assets</small></div></div>{portfolioHoverHolding && <div className={styles.portfolioDonutTooltip}><strong>{portfolioAssetName(portfolioHoverHolding.symbol)} ({portfolioHoverHolding.symbol})</strong><div><span>Percentage</span><b>{portfolioHoverHolding.percent.toFixed(2)}%</b></div><div><span>Amount</span><b>{portfolioHoverHolding.symbol === "USDT" ? portfolioHoverHolding.quantity.toFixed(2) : portfolioHoverHolding.quantity.toLocaleString("en-US", { maximumFractionDigits: 8 })}</b></div><div><span>Total</span><b>{compactMoney(portfolioHoverHolding.value)}</b></div></div>}</div>';
if (source.includes(dashboardOld)) source = source.replace(dashboardOld, dashboardNew);

if (!css.includes('.portfolioDonutTooltip')) {
  css += `\n\n/* Portfolio allocation hover tooltip */\n.portfolioDonutHoverWrap{position:relative;width:max-content;display:grid;place-items:center}.portfolioDonutTooltip{position:absolute;z-index:40;left:58%;top:18%;min-width:230px;padding:12px 14px;background:#f1f2f3;color:#252a2e;border:1px solid #c3c9cd;border-radius:7px;box-shadow:0 12px 30px rgba(0,0,0,.32);pointer-events:none;font-size:13px}.portfolioDonutTooltip>strong{display:block;font-size:14px;margin-bottom:8px;color:#252a2e}.portfolioDonutTooltip>div{display:grid;grid-template-columns:1fr auto;gap:22px;align-items:center;padding:4px 0}.portfolioDonutTooltip span{color:#3e464b}.portfolioDonutTooltip b{color:#2c3236;font-weight:700}.portfolioDonutTooltip>div:not(:last-child) span:after{content:"";display:inline-block;width:34px;margin-left:5px;border-bottom:1px dotted #aab0b4;vertical-align:middle}@media(max-width:680px){.portfolioDonutTooltip{left:45%;top:12%;min-width:205px}}\n`;
}

if (!source.includes('PORTFOLIO DONUT HOVER V1')) throw new Error('Portfolio donut hover state was not installed.');
if ((source.match(/portfolioDonutTooltip/g) ?? []).length < 2) throw new Error('Hover tooltips were not installed on both allocation donuts.');

fs.writeFileSync(traderPath, source);
fs.writeFileSync(cssPath, css);
console.log('Enabled 3Commas-style hover details on Dashboard and My Portfolio allocation donuts.');
