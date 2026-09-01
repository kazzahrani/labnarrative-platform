"use client";

import { browserSupabase } from "../../lib/supabase-browser";
import TraderV2FullShell from "./TraderV2FullShell";

type InvokeResult = { data: unknown; error: unknown };
type InvokeFn = (name: string, options?: Record<string, unknown>) => Promise<InvokeResult>;
type Json = Record<string, unknown>;

type Account = Json & { id?: string; kind?: string; exchangeStatus?: string };
type FunctionError = Error & { context?: Response };

const REAL_AUTOMATION_WRITES = new Set(["create_bot", "update_bot", "set_bot_status", "close_bot"]);
const CORE_V2_DIRECT_FUNCTIONS = new Set([
  "trader-v2-account-bootstrap",
  "trader-v2-analytics-read",
  "trader-v2-automation-submit",
  "trader-v2-automations-read",
  "trader-v2-command-capabilities",
  "trader-v2-connections-control",
  "trader-v2-connections-read",
  "trader-v2-exit-plan-preview",
  "trader-v2-exit-plan-submit",
  "trader-v2-history-read",
  "trader-v2-portfolio-read",
  "trader-v2-portfolio-refresh",
  "trader-v2-positions-read",
  "trader-v2-reconciliation-read",
  "trader-v2-signal-monitor-read",
  "trader-v2-transfer-reconcile",
  "trader-v2-workspace-read",
]);
let installed = false;
let cachedAccounts: Account[] = [];
let defaultAccount: string = "real";
let realAccountIds = new Set<string>();
let v2Cache: { expiresAt: number; promise: Promise<InvokeResult> } | null = null;

function asJson(value: unknown): Json {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Json : {};
}

function shouldUseAppProxy() {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname.toLowerCase();
  return host === "app.labnarrative.com"
    || host === "localhost"
    || host === "127.0.0.1"
    || host.endsWith(".vercel.app");
}

async function invokeThroughAppProxy(name: string, options: Record<string, unknown> = {}): Promise<InvokeResult> {
  const { data: sessionData, error: sessionError } = await browserSupabase.auth.getSession();
  const token = sessionData.session?.access_token || "";
  if (sessionError || !token) return { data: null, error: sessionError || new Error("unauthorized") };

  try {
    const response = await fetch("/api/trader/function-proxy", {
      method: "POST",
      headers: {
        "authorization": `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ name, body: options.body ?? {} }),
      cache: "no-store",
    });
    const context = response.clone();
    const text = await response.text();
    let data: unknown = null;
    try { data = text ? JSON.parse(text) : null; }
    catch { data = text || null; }

    if (!response.ok) {
      const payload = asJson(data);
      const error = new Error(String(payload.error || `function_http_${response.status}`)) as FunctionError;
      error.context = context;
      return { data: null, error };
    }
    return { data, error: null };
  } catch (caught) {
    return { data: null, error: caught instanceof Error ? caught : new Error("function_proxy_failed") };
  }
}

function installCoreV2Cutover() {
  if (installed) return;
  installed = true;

  const functions = browserSupabase.functions as unknown as { invoke: InvokeFn };
  const original = functions.invoke.bind(browserSupabase.functions) as InvokeFn;
  const invoke = (name: string, options: Record<string, unknown> = {}) =>
    CORE_V2_DIRECT_FUNCTIONS.has(name)
      ? original(name, options)
      : shouldUseAppProxy()
        ? invokeThroughAppProxy(name, options)
        : original(name, options);

  const invalidateV2 = () => { v2Cache = null; };
  const readV2 = () => {
    const now = Date.now();
    if (v2Cache && now < v2Cache.expiresAt) return v2Cache.promise;
    const promise = invoke("trader-v2-workspace-read", { body: {} });
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
      const accountResult = await invoke("trader-v2-account-bootstrap", { body: { action } });
      if (accountResult.error) return accountResult;
      const accountData = asJson(accountResult.data);
      if (accountData.ok !== true || !Array.isArray(accountData.accounts)) return accountResult;

      cachedAccounts = (accountData.accounts as Account[]).map((account) => ({ ...account }));
      realAccountIds = new Set(cachedAccounts.filter((account) => account.kind === "real").map((account) => String(account.id || "")).filter(Boolean));
      defaultAccount = String(accountData.defaultAccount || "real");
      const v2 = await readV2();
      if (!v2.error) updateRealConnectionState(v2.data);
      return { data: { ...accountData, accounts: cachedAccounts, defaultAccount }, error: null };
    }

    if (name === "trader-account-control" && REAL_AUTOMATION_WRITES.has(action)) {
      const accountId = String(body.accountId || "");
      if (realAccountIds.has(accountId)) {
        const submitted = await invoke("trader-v2-automation-submit", {
          body: { ...body, idempotencyKey: `ui-${action}-${crypto.randomUUID()}` },
        });
        if (submitted.error) return submitted;
        const submitData = asJson(submitted.data);
        if (submitData.ok !== true) return submitted;
        if (submitData.pending === true) return { data: { ok: false, error: "automation_command_pending" }, error: null };

        invalidateV2();
        const refreshed = await readV2();
        if (refreshed.error) return refreshed;
        const workspace = asJson(refreshed.data);
        updateRealConnectionState(workspace);
        const command = asJson(submitData.command);
        const commandResult = asJson(command.result);
        return {
          data: {
            ...workspace,
            botId: action === "create_bot" ? String(commandResult.clientId || "") : undefined,
            coreV2Command: { id: command.id, type: command.type, status: command.status, replayed: command.replayed === true },
          },
          error: null,
        };
      }
    }

    if (name === "trader-account-control" && action === "workspace_state") {
      const accountId = String(body.accountId || "");
      if (realAccountIds.has(accountId)) return await readV2();
    }

    if (name === "trader-binance-control" && action === "balances") return await readV2();
    return await invoke(name, options);
  };
}

export default function TraderV2FullShellCutover() {
  installCoreV2Cutover();
  return <TraderV2FullShell />;
}
