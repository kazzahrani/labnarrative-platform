import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "https://platform.labnarrative.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const LEGACY_EMAIL = "oxyginmusic@gmail.com";
const LEGACY_PAPER_ACCOUNT_ID = "afd5d578-4ff2-4ea7-b613-670ac01c7345";
const LEGACY_OWNER_ID = "d1c884ad-c093-438f-bcf2-ea82af52651b";

type Db = ReturnType<typeof createClient>;
type AccountRow = {
  id: string;
  owner_user_id: string | null;
  name: string;
  mode: "paper" | "shadow" | "live";
  status: string;
  quote_asset: string;
  starting_balance: number | string;
  created_at: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "content-type": "application/json", "cache-control": "no-store" },
  });
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function newAccessHash() {
  return await sha256(`${crypto.randomUUID()}:${crypto.randomUUID()}:${Date.now()}`);
}

async function accountsForUser(admin: Db, userId: string) {
  const { data, error } = await admin
    .from("trader_accounts")
    .select("id,owner_user_id,name,mode,status,quote_asset,starting_balance,created_at")
    .eq("owner_user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: true });
  if (error) throw error;

  const accounts = (data ?? []) as AccountRow[];
  const ids = accounts.map((account) => account.id);
  const connectionByAccount = new Map<string, { status: string; api_key_last4: string | null }>();

  if (ids.length) {
    const { data: connections, error: connectionError } = await admin
      .from("trader_binance_connections")
      .select("account_id,status,api_key_last4")
      .in("account_id", ids);
    if (connectionError) throw connectionError;
    for (const connection of connections ?? []) {
      connectionByAccount.set(String(connection.account_id), {
        status: String(connection.status || "disconnected"),
        api_key_last4: connection.api_key_last4 ? String(connection.api_key_last4) : null,
      });
    }
  }

  return accounts.map((account) => {
    const connection = connectionByAccount.get(account.id);
    return {
      id: account.id,
      name: account.name,
      kind: account.mode === "paper" ? "paper" : "real",
      mode: account.mode,
      status: account.status,
      quoteAsset: account.quote_asset,
      startingBalance: Number(account.starting_balance || 0),
      exchangeStatus: connection?.status ?? "disconnected",
      apiKeyLast4: connection?.api_key_last4 ?? null,
    };
  });
}

async function ensurePaperAccount(admin: Db, user: { id: string; email?: string | null }) {
  const { data: existing, error: existingError } = await admin
    .from("trader_accounts")
    .select("id")
    .eq("owner_user_id", user.id)
    .eq("mode", "paper")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) return String(existing.id);

  const email = (user.email || "").trim().toLowerCase();
  if (email === LEGACY_EMAIL) {
    const { data: legacy, error: legacyError } = await admin
      .from("trader_accounts")
      .select("id,owner_user_id,status,mode")
      .eq("id", LEGACY_PAPER_ACCOUNT_ID)
      .maybeSingle();
    if (legacyError) throw legacyError;
    if (legacy && legacy.status === "active" && legacy.mode === "paper") {
      if (legacy.owner_user_id === user.id) return LEGACY_PAPER_ACCOUNT_ID;
      if (legacy.owner_user_id === LEGACY_OWNER_ID) {
        const { data: claimed, error: claimError } = await admin
          .from("trader_accounts")
          .update({ owner_user_id: user.id, updated_at: new Date().toISOString() })
          .eq("id", LEGACY_PAPER_ACCOUNT_ID)
          .eq("owner_user_id", LEGACY_OWNER_ID)
          .select("id")
          .maybeSingle();
        if (claimError || !claimed) throw new Error("legacy_paper_claim_failed");
        return LEGACY_PAPER_ACCOUNT_ID;
      }
    }
  }

  const { data: created, error: createError } = await admin
    .from("trader_accounts")
    .insert({
      owner_user_id: user.id,
      access_token_hash: await newAccessHash(),
      name: "Paper Account",
      mode: "paper",
      status: "active",
      quote_asset: "USDT",
      starting_balance: 100000,
      fee_bps: 0,
    })
    .select("id")
    .single();
  if (createError) throw createError;
  return String(created.id);
}

async function ensureRealAccount(admin: Db, userId: string) {
  const { data: existing, error: existingError } = await admin
    .from("trader_accounts")
    .select("id")
    .eq("owner_user_id", userId)
    .neq("mode", "paper")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) return String(existing.id);

  const { data: created, error: createError } = await admin
    .from("trader_accounts")
    .insert({
      owner_user_id: userId,
      access_token_hash: await newAccessHash(),
      name: "Real Account",
      mode: "shadow",
      status: "active",
      quote_asset: "USDT",
      starting_balance: 0,
      fee_bps: 0,
    })
    .select("id")
    .single();
  if (createError) throw createError;

  const accountId = String(created.id);
  const { error: controlError } = await admin
    .from("trader_execution_controls")
    .upsert({
      account_id: accountId,
      global_live_enabled: false,
      kill_switch: true,
      max_live_capital: 0,
      max_single_order: 0,
      max_concurrent_live_trades: 1,
      daily_loss_limit: 0,
      live_confirmed_at: null,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    }, { onConflict: "account_id" });
  if (controlError) throw controlError;

  return accountId;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return json({ error: "server_configuration_missing" }, 500);

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "unauthorized" }, 401);

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  const user = userData.user;
  if (userError || !user) return json({ error: "unauthorized" }, 401);

  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const action = String(body.action || "bootstrap");

    if (action === "bootstrap" || action === "list") {
      await ensurePaperAccount(admin, user);
      return json({ ok: true, accounts: await accountsForUser(admin, user.id) });
    }

    if (action === "create_real") {
      await ensurePaperAccount(admin, user);
      const realAccountId = await ensureRealAccount(admin, user.id);
      return json({ ok: true, realAccountId, accounts: await accountsForUser(admin, user.id) });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (error) {
    console.error("trader-account-control", error instanceof Error ? error.message : String(error));
    return json({ error: "trader_account_control_failed" }, 400);
  }
});
