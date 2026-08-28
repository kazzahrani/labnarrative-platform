import fs from "node:fs";
import path from "node:path";

const shellPath=path.join(process.cwd(),"app","trader","TraderV2FullShell.tsx");
if(!fs.existsSync(shellPath))throw new Error("Portfolio Intelligence shell target missing");
let source=fs.readFileSync(shellPath,"utf8");

if(!source.includes('import PortfolioIntelligence from "./PortfolioIntelligence";')){
  const anchor='import CoinLogo from "./CoinLogo";';
  if(!source.includes(anchor))throw new Error("Portfolio Intelligence import anchor missing");
  source=source.replace(anchor,`${anchor}\nimport PortfolioIntelligence from "./PortfolioIntelligence";`);
}

const start=source.indexOf('  const portfolio = <>');
const end=source.indexOf('  const botsPage = <>',start);
if(start<0||end<=start)throw new Error("Portfolio Intelligence portfolio block anchor missing");

const replacement=`  const portfolio = <PortfolioIntelligence
    accountId={currentAccount.id}
    accountName={currentAccount.name}
    accountKind={currentAccount.kind}
    startingBalance={currentAccount.startingBalance}
    equity={displayedEquity}
    available={displayedAvailable}
    realizedPnl={stateAccount?.realizedPnl ?? 0}
    unrealizedPnl={stateAccount?.unrealizedPnl ?? 0}
    balances={displayBalances}
    trades={trades}
    bots={bots}
    onRefresh={() => { if (connected) void loadBalances(false); else void loadWorkspace(false); }}
  />;

`;
source=source.slice(0,start)+replacement+source.slice(end);

for(const marker of [
  'import PortfolioIntelligence from "./PortfolioIntelligence";',
  'const portfolio = <PortfolioIntelligence',
  'balances={displayBalances}',
  'trades={trades}',
  'bots={bots}',
])if(!source.includes(marker))throw new Error(`Portfolio Intelligence final shell missing ${marker}`);

fs.writeFileSync(shellPath,source);
console.log("Prepared automation-aware long-term Portfolio Intelligence workspace.");
