import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Keep the production live core immutable: this wrapper always executes the exact
// reviewed provider-aware worker revision, so later main-branch edits cannot change
// live execution behavior until a new immutable pin is deliberately deployed.
await import("https://raw.githubusercontent.com/kazzahrani/labnarrative-platform/4a7d6e29c4db1d132df661b67b59d454ae04fafb/supabase/functions/trader-live-worker/index.ts");
