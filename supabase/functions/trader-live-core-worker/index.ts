import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Keep the production live core immutable: this wrapper always executes the exact
// reviewed provider-aware worker revision, so later main-branch edits cannot change
// live execution behavior until a new immutable pin is deliberately deployed.
await import("https://raw.githubusercontent.com/kazzahrani/labnarrative-platform/3413f70d986f8d94d83ceb2a6506bfbbf2397b47/supabase/functions/trader-live-worker/index.ts");
