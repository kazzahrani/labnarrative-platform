import fs from "node:fs";
import path from "node:path";

const shellPath = path.join(process.cwd(), "app/trader/TraderV2FullShell.tsx");
let shell = fs.readFileSync(shellPath, "utf8");

const oldInvoke = `async function invokeBalances() {
  const { data, error } = await browserSupabase.functions.invoke("trader-binance-control", { body: { action: "balances" } });
  if (error) {
    let message = error.message || "binance_balance_failed";
    const context = (error as { context?: Response }).context;
    if (context) {
      try {
        const payload = await context.clone().json() as { error?: string };
        if (payload.error) message = payload.error;
      } catch {}
    }
    throw new Error(message);
  }
  const result = (data ?? {}) as BalanceResponse;
  if (result.error || result.ok !== true) throw new Error(result.error || "binance_balance_failed");
  return result;
}`;
const newInvoke = `async function invokeBalances() {
  const { data, error } = await browserSupabase.functions.invoke("trader-live-portfolio", { body: {} }); // TRADER_MULTIEXCHANGE_PORTFOLIO_V1
  if (error) {
    let message = error.message || "live_portfolio_failed";
    const context = (error as { context?: Response }).context;
    if (context) {
      try {
        const payload = await context.clone().json() as { error?: string };
        if (payload.error) message = payload.error;
      } catch {}
    }
    throw new Error(message);
  }
  const result = (data ?? {}) as BalanceResponse;
  if (result.error || result.ok !== true) throw new Error(result.error || "live_portfolio_failed");
  return result;
}`;

if (shell.includes(oldInvoke)) shell = shell.replace(oldInvoke, newInvoke);
else if (!shell.includes("TRADER_MULTIEXCHANGE_PORTFOLIO_V1")) throw new Error("Multi-exchange portfolio: balance invoker anchor missing");

shell = shell
  .replaceAll("All Binance Spot assets in USD", "All connected Spot exchange assets in USD")
  .replaceAll("Binance Spot balances · current USD value", "Connected Spot exchange balances · current USD value")
  .replaceAll("No non-zero Binance assets", "No non-zero exchange assets")
  .replaceAll("Link Binance to display your actual Spot balances here.", "Connect an exchange to display your actual Spot balances here.");

if (!shell.includes("TRADER_MULTIEXCHANGE_PORTFOLIO_V1")) throw new Error("Multi-exchange portfolio transform did not apply");
fs.writeFileSync(shellPath, shell);
console.log("Prepared aggregate Binance, Bybit, OKX and KuCoin live Portfolio balances.");
