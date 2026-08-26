import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Keep the live core source immutable per deployed version so a production worker
// can never drift when main changes. This revision uses a 55s normal lease,
// deterministic per-trade/per-sequence DCA revisions, and timeout reconciliation.
await import("https://raw.githubusercontent.com/kazzahrani/labnarrative-platform/c39419df46afd0f83c3198131dbf6a6f5923974f/supabase/functions/trader-live-worker/index.ts");
