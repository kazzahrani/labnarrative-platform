import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Keep the production live core immutable: this wrapper always executes the exact
// reviewed provider-aware worker revision, so later main-branch edits cannot change
// live execution behavior until a new immutable pin is deliberately deployed.
await import("https://raw.githubusercontent.com/kazzahrani/labnarrative-platform/ccbea94d40adcdb14d24987c16cd7f9f85eeb906/supabase/functions/trader-live-worker/index.ts");
