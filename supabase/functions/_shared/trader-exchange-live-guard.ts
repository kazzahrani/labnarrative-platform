import type { Db, LaunchExchangeProvider } from "./trader-exchange.ts";

export async function requireLiveExchangeConnection(
  db: Db,
  accountId: string,
  provider: LaunchExchangeProvider,
) {
  if (provider === "binance") {
    const { data, error } = await db
      .from("trader_binance_connections")
      .select("status,environment,permission_read,permission_trade,permission_withdraw,permission_internal_transfer,ip_restricted")
      .eq("account_id", accountId)
      .maybeSingle();
    if (error || !data) throw new Error("binance_not_connected");
    if (data.status !== "connected" || data.environment !== "mainnet" || data.permission_read !== true || data.permission_trade !== true) {
      throw new Error("binance_trade_permission_required");
    }
    if (data.permission_withdraw === true || data.permission_internal_transfer === true || data.ip_restricted !== true) {
      throw new Error("binance_connection_not_safe");
    }
    return;
  }

  const { data, error } = await db
    .from("trader_exchange_connections")
    .select("status,environment,permission_read,permission_trade,permission_withdraw")
    .eq("account_id", accountId)
    .eq("provider", provider)
    .maybeSingle();
  if (error || !data) throw new Error("exchange_connection_required");
  if (data.status !== "connected" || data.environment !== "mainnet" || data.permission_read !== true || data.permission_trade !== true) {
    throw new Error("exchange_trade_permission_required");
  }
  if (data.permission_withdraw === true) throw new Error("exchange_withdraw_permission_forbidden");
}
