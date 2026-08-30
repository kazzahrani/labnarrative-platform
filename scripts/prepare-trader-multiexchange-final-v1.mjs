import fs from "node:fs";
import path from "node:path";

const root=process.cwd();
const shellPath=path.join(root,"app","trader","TraderV2FullShell.tsx");
if(!fs.existsSync(shellPath))throw new Error(`Multi-exchange final target missing: ${shellPath}`);
let shell=fs.readFileSync(shellPath,"utf8");
const marker="MULTIEXCHANGE_FINAL_V1";
let changes=0;

function mustReplace(from,to,label){
  if(shell.includes(to))return;
  if(!shell.includes(from))throw new Error(`Multi-exchange final could not find ${label}`);
  shell=shell.replace(from,to);changes++;
}

if(!shell.includes(marker)){
  // The Overview transform creates the Settings → Connections route. Replace only
  // after every legacy connection transform has completed.
  mustReplace('import ConnectionsSettings from "./ConnectionsSettings";','import ExchangeConnectionsSimple from "./ExchangeConnectionsSimple";\nimport ExchangePortfolioOverview from "./ExchangePortfolioOverview";\n// MULTIEXCHANGE_FINAL_V1','ConnectionsSettings import');
  shell=shell.replaceAll('<ConnectionsSettings ','<ExchangeConnectionsSimple ');changes++;

  // Workspace results are still produced by the mature account controller. Enrich
  // those objects client-side with first-class venue metadata without disturbing
  // accounting, PnL, fills, orders, or the existing Binance live engine.
  if(!shell.includes("async function enrichWorkspaceExchanges")){
    const exportAnchor="export default function TraderV2FullShell";
    if(!shell.includes(exportAnchor))throw new Error("Multi-exchange final could not find Trader shell export");
    const helper=`async function enrichWorkspaceExchanges(result: WorkspaceResponse, accountId: string): Promise<WorkspaceResponse> {\n  try {\n    const { data, error } = await browserSupabase.functions.invoke(\"trader-exchange-workspace-meta\", { body: { accountId } });\n    if (error || !data) return result;\n    const meta = data as { bots?: Array<{id:string;exchangeProvider:string}>; trades?: Array<{id:string;exchangeProvider:string}> };\n    const botMap = new Map((meta.bots ?? []).map(item => [item.id, item.exchangeProvider]));\n    const tradeMap = new Map((meta.trades ?? []).map(item => [item.id, item.exchangeProvider]));\n    return {\n      ...result,\n      bots: (result.bots ?? []).map(bot => ({ ...bot, exchangeProvider: botMap.get(bot.id) ?? bot.exchangeProvider ?? \"binance\" })),\n      trades: (result.trades ?? []).map(trade => ({ ...trade, exchangeProvider: tradeMap.get(trade.id) ?? trade.exchangeProvider ?? \"binance\" })),\n    };\n  } catch {\n    return result;\n  }\n}\n\n`;
    shell=shell.replace(exportAnchor,helper+exportAnchor);changes++;
  }

  // The exchange-aware bot transform has already added Bot.exchangeProvider. Add
  // the equivalent property to trades so Positions carry the venue as well.
  if(!/type Trade\s*=\s*\{[\s\S]*?exchangeProvider\?:\s*string;/.test(shell)){
    const tradeType=/type Trade\s*=\s*\{[\s\S]*?botName:\s*string;/;
    const match=shell.match(tradeType);
    if(!match)throw new Error("Multi-exchange final could not find Trade type");
    shell=shell.replace(match[0],match[0]+"\n  exchangeProvider?: string;");changes++;
  }

  // Enrich only the workspace load path. Other setWorkspace calls are responses
  // from mutations and will be refreshed by the normal workspace polling cycle.
  const loadStart=shell.indexOf("  const loadWorkspace = async");
  const loadEnd=shell.indexOf("  const loadBalances",loadStart);
  if(loadStart<0||loadEnd<=loadStart)throw new Error("Multi-exchange final could not isolate loadWorkspace");
  let loadBlock=shell.slice(loadStart,loadEnd);
  if(!loadBlock.includes("enrichWorkspaceExchanges")){
    if(!loadBlock.includes("setWorkspace(result);"))throw new Error("Multi-exchange final could not find workspace setter");
    loadBlock=loadBlock.replace("setWorkspace(result);","setWorkspace(await enrichWorkspaceExchanges(result, currentAccount.id));");
    shell=shell.slice(0,loadStart)+loadBlock+shell.slice(loadEnd);changes++;
  }

  // Add an exchange-level portfolio summary above the existing mature Binance
  // asset detail. The old detail remains untouched to preserve its accounting UX.
  if(!shell.includes("<ExchangePortfolioOverview")){
    const portfolioMatch=shell.match(/(\s+const portfolio\s*=\s*(?:\(\s*)?<>\s*)/);
    if(!portfolioMatch)throw new Error("Multi-exchange final could not find Portfolio fragment");
    const addition=`$1{currentAccount.kind === \"real\" && <ExchangePortfolioOverview binanceConnected={connected} binanceLast4={currentAccount.apiKeyLast4} refreshKey={workspace?.account?.lastWorkerAt ?? \"\"} />}\n    `;
    shell=shell.replace(portfolioMatch[0],addition);changes++;
  }

  // Positions: show the venue beside the automation identity while leaving every
  // price/PnL/action component from position-row-v4 unchanged.
  if(!shell.includes("botExchangeLabel(trade.exchangeProvider)")){
    const identity="{trade.botName} · {trade.executionMode}";
    if(!shell.includes(identity))throw new Error("Multi-exchange final could not find Position identity line");
    shell=shell.replaceAll(identity,"{trade.botName} · {botExchangeLabel(trade.exchangeProvider)} · {trade.executionMode}");changes++;
  }
}

for(const required of [
  marker,
  "<ExchangeConnectionsSimple",
  "<ExchangePortfolioOverview",
  "async function enrichWorkspaceExchanges",
  "exchangeProvider?: string;",
  "botExchangeLabel(trade.exchangeProvider)",
]) if(!shell.includes(required))throw new Error(`Multi-exchange final shell missing ${required}`);

fs.writeFileSync(shellPath,shell);
console.log(`Finalized simple multi-exchange Connections, Portfolio, Automations and Positions (${changes} changes).`);
