import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// The pinned legacy core calls .catch() directly on a Supabase RPC query builder
// while releasing trader_accounts.worker_lock. Supabase builders are thenables;
// add Promise-like catch to that builder prototype so the release is actually
// awaited instead of leaving the account locked until the 20-second lease ends.
const url = Deno.env.get("SUPABASE_URL");
const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (url && key) {
  const probe = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    .rpc("trader_release_account", {
      p_account_id: "00000000-0000-0000-0000-000000000000",
      p_worker_id: "probe",
    });
  const proto = Object.getPrototypeOf(probe) as Record<string, unknown> | null;
  if (proto && typeof proto.catch !== "function") {
    Object.defineProperty(proto, "catch", {
      configurable: true,
      writable: true,
      value: function (onRejected: (reason: unknown) => unknown) {
        return Promise.resolve(this).catch(onRejected);
      },
    });
  }
}

await import("https://raw.githubusercontent.com/kazzahrani/labnarrative-platform/9742ab463331828e0d3afa683bbe83451b0a2c05/supabase/functions/trader-live-worker/index.ts");
