import fs from "node:fs";
import path from "node:path";

const target=path.join(process.cwd(),"app","trader","TraderV2FullShell.tsx");
if(!fs.existsSync(target))throw new Error("Trader bot popup target missing");
let source=fs.readFileSync(target,"utf8");
const marker="BOT_POPUP_COPY_DELETE_V1";

if(!source.includes(marker)){
  const invokeFrom='browserSupabase.functions.invoke("trader-account-control", { body });';
  const invokeTo='browserSupabase.functions.invoke("trader-account-control-v2", { body });';
  if(!source.includes(invokeFrom)&&!source.includes(invokeTo))throw new Error("Bot popup actions could not find account control invocation");
  if(source.includes(invokeFrom))source=source.replace(invokeFrom,invokeTo);

  const actionAnchor='\n  if (!authReady) return <div className={styles.loadingPage}>Checking secure session…</div>;';
  if(!source.includes(actionAnchor))throw new Error("Bot popup actions could not find action insertion anchor");
  const actions=`\n  // ${marker}\n  const copyBot = async (bot: Bot) => {\n    if (!currentAccount || busy) return;\n    setBusy(true); setError(\"\");\n    try {\n      const result = await invokeAccount({ action: \"copy_bot\", accountId: currentAccount.id, botId: bot.id });\n      const copiedId = String((result as { botId?: string }).botId || \"\");\n      const copiedBot = (result.bots ?? []).find((candidate) => candidate.id === copiedId) ?? null;\n      setWorkspace(result); setBotTab(\"Active\");\n      if (copiedBot) {\n        setSelectedBotId(copiedBot.id);\n        setBotForm(botFormFrom(copiedBot));\n        setBotModalMode(\"edit\");\n        setNotice(copiedBot.name + \" created paused. Review the copied configuration, then save or resume when ready.\");\n      } else {\n        setBotModalMode(null); setSelectedBotId(null);\n        setNotice(bot.name + \"_copy created and left paused.\");\n      }\n    } catch (caught) {\n      const message = caught instanceof Error ? caught.message : \"Unable to copy bot.\";\n      setError(message.includes(\"strategy_copy_not_supported\") ? \"Strategy Execution automations cannot be copied from this DCA bot action.\" : message);\n    } finally { setBusy(false); }\n  };\n  const deleteBot = async (bot: Bot) => {\n    if (!currentAccount || busy) return;\n    if (!window.confirm(\"Delete \" + bot.name + \" from the bot list? Completed trades, orders and history will be kept. Deletion is blocked while the bot has an active position or open order.\")) return;\n    setBusy(true); setError(\"\");\n    try {\n      const result = await invokeAccount({ action: \"delete_bot\", accountId: currentAccount.id, botId: bot.id });\n      setWorkspace(result); setBotModalMode(null); setSelectedBotId(null);\n      setNotice(bot.name + \" deleted. Its completed trading history was preserved.\");\n    } catch (caught) {\n      const message = caught instanceof Error ? caught.message : \"Unable to delete bot.\";\n      const friendly = message.includes(\"bot_has_active_trades\") ? \"This bot cannot be deleted while it has an active position. Pause it and close the position first.\" : message.includes(\"bot_has_open_orders\") ? \"This bot cannot be deleted while it has an open order. Cancel or finish the order first.\" : message.includes(\"strategy_delete_not_supported\") ? \"Strategy Execution automations cannot be deleted from this DCA bot action.\" : message;\n      setError(friendly);\n    } finally { setBusy(false); }\n  };\n`;
  source=source.replace(actionAnchor,actions+actionAnchor);

  const editButton='<button className={dca.primary} onClick={editBot}>Edit bot</button>';
  if(!source.includes(editButton))throw new Error("Bot popup actions could not find Edit bot button");
  source=source.replace(editButton,editButton+'<button disabled={busy} onClick={() => void copyBot(selectedBot!)}>Copy bot</button>');

  const closePattern=/<button disabled=\{busy\} onClick=\{\(\) => void closeBot\(selectedBot!\)\}>Close(?: bot)?<\/button>/;
  if(!closePattern.test(source))throw new Error("Bot popup actions could not find Close button");
  source=source.replace(closePattern,(match)=>match+'<button disabled={busy} onClick={() => void deleteBot(selectedBot!)}>Delete bot</button>');
}

for(const required of[marker,'trader-account-control-v2','>Copy bot</button>','>Delete bot</button>','action: "copy_bot"','action: "delete_bot"','setBotModalMode("edit")']){
  if(!source.includes(required))throw new Error(`Bot popup action output missing ${required}`);
}
fs.writeFileSync(target,source);
console.log("Prepared bot popup Copy bot, immediate copied-configuration edit, and safe Delete bot actions.");
