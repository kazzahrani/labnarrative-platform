import fs from "node:fs";
import path from "node:path";

const shellTarget=path.join(process.cwd(),"app","trader","TraderV2FullShell.tsx");
const configuratorTarget=path.join(process.cwd(),"app","trader","DcaBotConfigurator.tsx");
if(!fs.existsSync(shellTarget))throw new Error("Trader bot popup target missing");
if(!fs.existsSync(configuratorTarget))throw new Error("DCA configurator target missing");
let source=fs.readFileSync(shellTarget,"utf8");
let configurator=fs.readFileSync(configuratorTarget,"utf8");
const marker="BOT_POPUP_COPY_DRAFT_DELETE_V2";
const archivedMarker="BOT_POPUP_ARCHIVED_COPY_DELETE_V1";

if(!source.includes(marker)){
  const invokeFrom='browserSupabase.functions.invoke("trader-account-control", { body });';
  const invokeTo='browserSupabase.functions.invoke("trader-account-control-v2", { body });';
  if(!source.includes(invokeFrom)&&!source.includes(invokeTo))throw new Error("Bot popup actions could not find account control invocation");
  if(source.includes(invokeFrom))source=source.replace(invokeFrom,invokeTo);

  const stateFrom='  const [selectedBotId, setSelectedBotId] = useState<string | null>(null);';
  const stateTo=stateFrom+'\n  const [copySourceBotId, setCopySourceBotId] = useState<string | null>(null);';
  if(!source.includes(stateFrom)&&!source.includes('copySourceBotId'))throw new Error("Bot copy draft could not find bot selection state");
  if(source.includes(stateFrom))source=source.replace(stateFrom,stateTo);

  const actionAnchor='\n  if (!authReady) return <div className={styles.loadingPage}>Checking secure session…</div>;';
  if(!source.includes(actionAnchor))throw new Error("Bot popup actions could not find action insertion anchor");
  const actions=`\n  // ${marker}\n  useEffect(() => { if (!botModalMode) setCopySourceBotId(null); }, [botModalMode]);\n\n  const copyBot = (bot: Bot) => {\n    if (busy) return;\n    setError(\"\");\n    setCopySourceBotId(bot.id);\n    setSelectedBotId(null);\n    setBotModalMode(\"create\");\n    setBotTab(\"Active\");\n    setNotice(\"\");\n  };\n  const deleteBot = async (bot: Bot) => {\n    if (!currentAccount || busy) return;\n    if (!window.confirm(\"Delete \" + bot.name + \" from the bot list? Completed trades, orders and history will be kept. Deletion is blocked while the bot has an active position or open order.\")) return;\n    setBusy(true); setError(\"\");\n    try {\n      const result = await invokeAccount({ action: \"delete_bot\", accountId: currentAccount.id, botId: bot.id });\n      setWorkspace(result); setBotModalMode(null); setSelectedBotId(null); setCopySourceBotId(null);\n      setNotice(bot.name + \" deleted. Its completed trading history was preserved.\");\n    } catch (caught) {\n      const message = caught instanceof Error ? caught.message : \"Unable to delete bot.\";\n      const friendly = message.includes(\"bot_has_active_trades\") ? \"This bot cannot be deleted while it has an active position. Pause it and close the position first.\" : message.includes(\"bot_has_open_orders\") ? \"This bot cannot be deleted while it has an open order. Cancel or finish the order first.\" : message.includes(\"strategy_delete_not_supported\") ? \"Strategy Execution automations cannot be deleted from this DCA bot action.\" : message;\n      setError(friendly);\n    } finally { setBusy(false); }\n  };\n`;
  source=source.replace(actionAnchor,actions+actionAnchor);

  const modalBotId='  botId={selectedBotId}\n  onCancel=';
  if(!source.includes(modalBotId))throw new Error("Bot copy draft could not find configurator botId prop");
  source=source.replace(modalBotId,'  botId={selectedBotId}\n  copyFromBotId={copySourceBotId}\n  onCancel=');

  const savedAnchor='  onSaved={(savedBotId, action) => {\n    if (savedBotId) setSelectedBotId(savedBotId);';
  if(!source.includes(savedAnchor))throw new Error("Bot copy draft could not find configurator save callback");
  source=source.replace(savedAnchor,'  onSaved={(savedBotId, action) => {\n    setCopySourceBotId(null);\n    if (savedBotId) setSelectedBotId(savedBotId);');

  const editButton='<button className={dca.primary} onClick={editBot}>Edit bot</button>';
  if(!source.includes(editButton))throw new Error("Bot popup actions could not find Edit bot button");
  source=source.replace(editButton,editButton+'<button disabled={busy} onClick={() => copyBot(selectedBot!)}>Copy bot</button>');

  const closePattern=/<button disabled=\{busy\} onClick=\{\(\) => void closeBot\(selectedBot!\)\}>Close(?: bot)?<\/button>/;
  if(!closePattern.test(source))throw new Error("Bot popup actions could not find Close button");
  source=source.replace(closePattern,(match)=>match+'<button disabled={busy} onClick={() => void deleteBot(selectedBot!)}>Delete bot</button>');
}

if(!source.includes(archivedMarker)){
  const closeX='<button className={dca.closeX} onClick={() => setBotModalMode(null)}>×</button>';
  if(!source.includes(closeX))throw new Error("Archived bot actions could not find popup close button");
  const archivedActions=`{/* ${archivedMarker} */}{botModalMode === "view" && selectedBot?.lifecycle === "closed" && <><button disabled={busy} onClick={() => copyBot(selectedBot!)}>Copy bot</button><button disabled={busy} onClick={() => void deleteBot(selectedBot!)}>Delete bot</button></>}`;
  source=source.replace(closeX,archivedActions+closeX);
}

if(!configurator.includes('copyFromBotId?: string | null;')){
  const propsFrom='  botId: string | null;\n  onCancel: () => void;';
  const propsTo='  botId: string | null;\n  copyFromBotId?: string | null;\n  onCancel: () => void;';
  if(!configurator.includes(propsFrom))throw new Error("Bot copy draft could not extend configurator props");
  configurator=configurator.replace(propsFrom,propsTo);

  const signaturePattern=/export default function DcaBotConfigurator\(\{([^}]*)\}:Props\)\{/;
  const signatureMatch=configurator.match(signaturePattern);
  if(!signatureMatch)throw new Error("Bot copy draft could not find configurator signature");
  if(!signatureMatch[1].includes("copyFromBotId")){
    if(!signatureMatch[1].includes("botId"))throw new Error("Bot copy draft configurator signature has no botId");
    const nextSignature=signatureMatch[0].replace(/botId\s*,/,"botId,copyFromBotId,");
    configurator=configurator.replace(signatureMatch[0],nextSignature);
  }

  const createGuard='    if(mode==="create"||!botId){setForm({...NEW_FORM,pairs:["BTC/USDT"]});setLoading(false);return()=>{alive=false};}\n    setLoading(true);setLocalError("");\n    void invokeDca({action:"bot_detail",accountId,botId})';
  const draftGuard='    const detailBotId=mode==="create"?(copyFromBotId||null):botId;\n    if(!detailBotId){setForm({...NEW_FORM,pairs:["BTC/USDT"]});setLoading(false);return()=>{alive=false};}\n    setLoading(true);setLocalError("");\n    void invokeDca({action:"bot_detail",accountId,botId:detailBotId})';
  if(!configurator.includes(createGuard))throw new Error("Bot copy draft could not find configurator load guard");
  configurator=configurator.replace(createGuard,draftGuard);

  const hydrateName='const bot=result.bot;setForm({name:bot.name,';
  const hydrateDraftName='const bot=result.bot;const draftName=mode==="create"&&copyFromBotId?`${bot.name}_copy`:bot.name;setForm({name:draftName,';
  if(!configurator.includes(hydrateName))throw new Error("Bot copy draft could not find bot hydration");
  configurator=configurator.replace(hydrateName,hydrateDraftName);

  const depsFrom='  },[accountId,botId,mode]);';
  const depsTo='  },[accountId,botId,copyFromBotId,mode]);';
  if(!configurator.includes(depsFrom))throw new Error("Bot copy draft could not extend configurator dependencies");
  configurator=configurator.replace(depsFrom,depsTo);
}

for(const required of[marker,archivedMarker,'trader-account-control-v2','copySourceBotId','copyFromBotId={copySourceBotId}','>Copy bot</button>','>Delete bot</button>','action: "delete_bot"','setBotModalMode("create")','selectedBot?.lifecycle === "closed"']){
  if(!source.includes(required))throw new Error(`Bot popup action output missing ${required}`);
}
for(const required of['copyFromBotId?: string | null;','botId:detailBotId','`${bot.name}_copy`','mode==="create"?"create_bot":"update_bot"']){
  if(!configurator.includes(required))throw new Error(`Bot copy draft configurator output missing ${required}`);
}
if(source.includes('action: "copy_bot"'))throw new Error("Copy bot must not create a database bot before Launch DCA Strategy");

fs.writeFileSync(shellTarget,source);
fs.writeFileSync(configuratorTarget,configurator);
console.log("Prepared bot popup Copy bot as an unsaved _copy draft, including archived bots, plus safe Delete bot actions.");
