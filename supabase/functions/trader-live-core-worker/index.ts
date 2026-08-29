import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Keep the live core source immutable per deployed version so a production worker
// can never drift when main changes. This revision keeps the 55s normal lease,
// collision-safe DCA reconciliation, and adds real trailing Take Profit support.
await import("https://raw.githubusercontent.com/kazzahrani/labnarrative-platform/71c6094834b96905c6afe2f30ddcc1230471c7ac/supabase/functions/trader-live-worker/index.ts");
