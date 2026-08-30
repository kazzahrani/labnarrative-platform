import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Keep the production live core immutable: this wrapper always executes the exact
// reviewed provider-aware worker revision, so later main-branch edits cannot change
// live execution behavior until a new immutable pin is deliberately deployed.
await import("https://raw.githubusercontent.com/kazzahrani/labnarrative-platform/3d0f7b8bf5d73cb335f8ea161771bf1e4caa3973/supabase/functions/trader-live-worker/index.ts");