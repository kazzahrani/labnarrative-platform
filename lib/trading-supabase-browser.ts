import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const TRADING_SUPABASE_URL = "https://tksxauosaswshylbaayf.supabase.co";
const TRADING_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_tqhr6-YB7dXxdcogjPVAiw_RVlSYbZt";

type TradingGlobal = typeof globalThis & {
  __labNarrativeTradingBrowserSupabase?: SupabaseClient;
};

const globalClient = globalThis as TradingGlobal;

function createTradingBrowserClient(): SupabaseClient {
  return createClient(TRADING_SUPABASE_URL, TRADING_SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  });
}

export const tradingBrowserSupabase =
  globalClient.__labNarrativeTradingBrowserSupabase ?? createTradingBrowserClient();

globalClient.__labNarrativeTradingBrowserSupabase = tradingBrowserSupabase;
