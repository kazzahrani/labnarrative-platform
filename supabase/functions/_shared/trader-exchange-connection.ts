import type { Db, LaunchExchangeProvider } from "./trader-exchange.ts";

export type ExchangeConnectionAccess = {
  provider: LaunchExchangeProvider;
  status: string;
  permissionRead: boolean;
  permissionTrade: boolean;
  permissionWithdraw: boolean;
};

export async function requireExchangeConnection(
  db: Db,
  accountId: string,
  provider: LaunchExchangeProvider,
  options: { requireTradingPermission?: boolean } = {},
): Promise<ExchangeConnectionAccess> {
  const requireTrade = options.requireTradingPermission === true;
  const table = provider === "binance" ? "trader_binance_connections" : "trader_exchange_connections";
  let query = db
    .from(table)
    .select("status,permission_read,permission_trade,permission_withdraw")
    .eq("account_id", accountId);
  if (provider !== "binance") query = query.eq("provider", provider);

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data || data.status !== "connected" || data.permission_read !== true) {
    throw new Error("exchange_connection_required");
  }
  if (data.permission_withdraw === true) {
    throw new Error("exchange_withdraw_permission_forbidden");
  }
  if (requireTrade && data.permission_trade !== true) {
    throw new Error("exchange_trade_permission_required");
  }

  return {
    provider,
    status: String(data.status),
    permissionRead: data.permission_read === true,
    permissionTrade: data.permission_trade === true,
    permissionWithdraw: data.permission_withdraw === true,
  };
}
