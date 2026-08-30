import type { Db, ExchangeExecutionAdapter, LaunchExchangeProvider } from "./trader-exchange.ts";
import { createExchangeExecutionAdapter } from "./trader-exchange.ts";
import { BybitAdapter } from "./trader-exchange-bybit.ts";
import { OkxAdapter } from "./trader-exchange-okx.ts";
import { KucoinAdapter } from "./trader-exchange-kucoin.ts";

export function createLaunchExchangeExecutionAdapter(
  db: Db,
  accountId: string,
  provider: LaunchExchangeProvider,
): ExchangeExecutionAdapter {
  if (provider === "binance") return createExchangeExecutionAdapter(db, accountId, "binance");
  if (provider === "bybit") return new BybitAdapter(db, accountId);
  if (provider === "okx") return new OkxAdapter(db, accountId);
  if (provider === "kucoin") return new KucoinAdapter(db, accountId);
  const exhaustive: never = provider;
  throw new Error(`unsupported_exchange_provider:${exhaustive}`);
}
