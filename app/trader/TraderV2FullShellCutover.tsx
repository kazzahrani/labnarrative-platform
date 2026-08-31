"use client";

import { browserSupabase } from "../../lib/supabase-browser";
import TraderV2FullShell from "./TraderV2FullShell";

type InvokeResult = { data: unknown; error: unknown };
type InvokeFn = (name: string, options?: Record<string, unknown>) => Promise<InvokeResult>;
type Json = Record<string, unknown>;

type Account = Json & { id?: string; kind?: string; exchangeStatus?: string };

let installed = false;
let cachedAccounts: Account[] = [];
let defaultAccount: string = "real";
let realAccountIds = new Set<string>();
let v2Cache: { expiresAt: number; promise: Promise<InvokeResult> } | null = null;

function asJson(value: unknown): Json {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Json : {};
}

function installCoreV2ReadCutover() {
  if (installed) return;
  installed = true;

  const functions = browserSupabase.functions as unknown as { invoke: InvokeFn };
  const original = functions.invoke.bind(browserSupabase.functions) as InvokeFn;

  const readV2 = () => {
    const now = Date.now();
    if (v2Cache && now < v2Cache.expiresAt) return v2Cache.promise;
    const promise = original("trader-v2-workspace-read", { body: {} });
    v2Cache = { expiresAt: now + 1500, promise };
    void promise.then((result) => { if (result.error) v2Cache = null; });
    return promise;
  };

  const updateRealConnectionState = (payload: unknown) => {
    const v2 = asJson(payload);
    const connected = Number(v2.supportedConnectedCount ?? 0) > 0;
    const accountId = String(v2.accountId || "");
    if (accountId) realAccountIds.add(accountId);
    cachedAccounts = cachedAccounts.map((account) => account.kind === "real"
      ? { ...account, exchangeStatus: connected ? "connected" : "disconnected" }
      : account);
  };

  functions.invoke = async (name: string, options: Record<string, unknown> = {}) => {
    const body = asJson(options.body);
    const action = String(body.action || "");

    if (name === "trader-account-control" && (action === "bootstrap" || action === "list")) {
      if (action === "bootstrap" || cachedAccounts.length === 0) {
        const legacy = await original(name, options);
        const legacyData = asJson(legacy.data);
        if (!legacy.error && legacyData.ok === true && Array.isArray(legacyData.accounts)) {
          cachedAccounts = (legacyData.accounts as Account[]).map((account) => ({ ...account }));
          realAccountIds = new Set(cachedAccounts.filter((account) => account.kind === "real").map((account) => String(account.id || "")).filter(Boolean));
          defaultAccount = String(legacyData.defaultAccount || "real");
          const v2 = await readV2();
          if (!v2.error) updateRealConnectionState(v2.data);
          return { data: { ...legacyData, accounts: cachedAccounts }, error: null };
        }
        return legacy;
      }

      const v2 = await readV2();
      if (!v2.error) updateRealConnectionState(v2.data);
      return { data: { ok: true, accounts: cachedAccounts, defaultAccount }, error: null };
    }

    if (name === "trader-account-control" && action === "workspace_state") {
      const accountId = String(body.accountId || "");
      if (realAccountIds.has(accountId)) return await readV2();
    }

    if (name === "trader-binance-control" && action === "balances") {
      return await readV2();
    }

    return await original(name, options);
  };
}

export default function TraderV2FullShellCutover() {
  installCoreV2ReadCutover();
  return <TraderV2FullShell />;
}
