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
  mustReplace('import ConnectionsSettings from "./ConnectionsSettings";','import ExchangeConnectionsSimple from "./ExchangeConnectionsSimple";\nimport ExchangePortfolioOverview from "./ExchangePortfolioOverview";\n// MULTIEXCHANGE_FINAL_V1','ConnectionsSettings import');
  shell=shell.replaceAll('<ConnectionsSettings ','<ExchangeConnectionsSimple ');changes++;

  if(!/type WorkspaceResponse\s*=\s*\{[\s\S]*?exchangeConnectionCount\?:\s*number;/.test(shell)){
    const workspaceType=/type WorkspaceResponse\s*=\s*\{[\s\S]*?error\?:\s*string;\s*\};/;
    const match=shell.match(workspaceType);
    if(!match)throw new Error("Multi-exchange final could not find WorkspaceResponse type");
    shell=shell.replace(match[0],match[0].replace(/error\?:\s*string;/,'exchangeConnectionCount?: number;\n  error?: string;'));changes++;
  }

  if(!shell.includes("async function enrichWorkspaceExchanges")){
    const exportAnchor="export default function TraderV2FullShell";
    if(!shell.includes(exportAnchor))throw new Error("Multi-exchange final could not find Trader shell export");
    const helper=`async function enrichWorkspaceExchanges(result: WorkspaceResponse, accountId: string): Promise<WorkspaceResponse> {\n  try {\n    const { data, error } = await browserSupabase.functions.invoke(\"trader-exchange-workspace-meta\", { body: { accountId } });\n    if (error || !data) return result;\n    const meta = data as { bots?: Array<{id:string;exchangeProvider:string}>; trades?: Array<{id:string;exchangeProvider:string}>; connections?: Array<{provider:string;status:string}> };\n    const botMap = new Map((meta.bots ?? []).map(item => [item.id, item.exchangeProvider]));\n    const tradeMap = new Map((meta.trades ?? []).map(item => [item.id, item.exchangeProvider]));\n    const exchangeConnectionCount = (meta.connections ?? []).filter(item => item.status === \"connected\").length;\n    return {\n      ...result,\n      exchangeConnectionCount,\n      bots: (result.bots ?? []).map(bot => ({ ...bot, exchangeProvider: botMap.get(bot.id) ?? bot.exchangeProvider ?? \"binance\" })),\n      trades: (result.trades ?? []).map(trade => ({ ...trade, exchangeProvider: tradeMap.get(trade.id) ?? trade.exchangeProvider ?? \"binance\" })),\n    };\n  } catch {\n    return result;\n  }\n}\n\n`;
    shell=shell.replace(exportAnchor,helper+exportAnchor);changes++;
  }

  if(!/type Trade\s*=\s*\{[\s\S]*?exchangeProvider\?:\s*string;/.test(shell)){
    const tradeType=/type Trade\s*=\s*\{[\s\S]*?botName:\s*string;/;
    const match=shell.match(tradeType);
    if(!match)throw new Error("Multi-exchange final could not find Trade type");
    shell=shell.replace(match[0],match[0]+"\n  exchangeProvider?: string;");changes++;
  }

  const loadStart=shell.indexOf("  const loadWorkspace = async");
  const loadEnd=shell.indexOf("  const loadBalances",loadStart);
  if(loadStart<0||loadEnd<=loadStart)throw new Error("Multi-exchange final could not isolate loadWorkspace");
  let loadBlock=shell.slice(loadStart,loadEnd);
  if(!loadBlock.includes("enrichWorkspaceExchanges")){
    if(!loadBlock.includes("setWorkspace(result);"))throw new Error("Multi-exchange final could not find workspace setter");
    loadBlock=loadBlock.replace("setWorkspace(result);","setWorkspace(await enrichWorkspaceExchanges(result, currentAccount.id));");
    shell=shell.slice(0,loadStart)+loadBlock+shell.slice(loadEnd);changes++;
  }

  if(!shell.includes("const hasAnyExchange =")){
    const connectedLine='  const connected = currentAccount?.kind === "real" && currentAccount.exchangeStatus === "connected";';
    if(!shell.includes(connectedLine))throw new Error("Multi-exchange final could not find Binance connected state");
    shell=shell.replace(connectedLine,connectedLine+'\n  const hasAnyExchange = connected || Number(workspace?.exchangeConnectionCount ?? 0) > 0;');changes++;
  }
  if(shell.includes('if (currentAccount.kind === "real" && !connected) { setExchangeModal(true); return; }')){
    shell=shell.replace('if (currentAccount.kind === "real" && !connected) { setExchangeModal(true); return; }','if (currentAccount.kind === "real" && !hasAnyExchange) { setExchangeModal(true); return; }');changes++;
  }
  const overviewConnected='hasConnectedExchange={accounts.some((account) => account.kind === "real" && account.exchangeStatus === "connected")}';
  if(shell.includes(overviewConnected)){shell=shell.replace(overviewConnected,'hasConnectedExchange={hasAnyExchange}');changes++;}

  if(!shell.includes("<ExchangePortfolioOverview")){
    const portfolioStart=shell.indexOf("  const portfolio = ");
    const botsStart=shell.indexOf("  const botsPage = ",portfolioStart);
    if(portfolioStart<0||botsStart<=portfolioStart)throw new Error("Multi-exchange final could not isolate Portfolio expression");
    const declaration=shell.slice(portfolioStart,botsStart);
    const prefix="  const portfolio = ";
    let expression=declaration.slice(prefix.length).trim();
    if(!expression.endsWith(";"))throw new Error("Multi-exchange final Portfolio expression has unexpected ending");
    expression=expression.slice(0,-1).trim();
    const replacement=`  const portfolio = <>\n    {currentAccount.kind === \"real\" && <ExchangePortfolioOverview binanceConnected={connected} binanceLast4={currentAccount.apiKeyLast4} refreshKey={workspace?.account?.lastWorkerAt ?? \"\"} />}\n    {${expression}}\n  </>;\n\n`;
    shell=shell.slice(0,portfolioStart)+replacement+shell.slice(botsStart);changes++;
  }

  if(!shell.includes("botExchangeLabel(trade.exchangeProvider)")){
    const identity="{trade.botName} · {trade.executionMode}";
    if(shell.includes(identity)){
      shell=shell.replaceAll(identity,"{trade.botName} · {botExchangeLabel(trade.exchangeProvider)} · {trade.executionMode}");changes++;
    }else{
      const compactIdentity=/(<div className=\{dca\.tradeIdentity\}>[\s\S]{0,600}?<small>)([\s\S]{0,350}?)(<\/small>)/;
      if(!compactIdentity.test(shell))throw new Error("Multi-exchange final could not find compact Position identity");
      shell=shell.replace(compactIdentity,'$1$2 · {botExchangeLabel(trade.exchangeProvider)}$3');changes++;
    }
  }
}

for(const required of [
  marker,
  "<ExchangeConnectionsSimple",
  "<ExchangePortfolioOverview",
  "async function enrichWorkspaceExchanges",
  "exchangeConnectionCount?: number;",
  "const hasAnyExchange =",
  "exchangeProvider?: string;",
  "botExchangeLabel(trade.exchangeProvider)",
]) if(!shell.includes(required))throw new Error(`Multi-exchange final shell missing ${required}`);

fs.writeFileSync(shellPath,shell);
console.log(`Finalized simple multi-exchange Connections, Portfolio, Automations and Positions (${changes} changes).`);
