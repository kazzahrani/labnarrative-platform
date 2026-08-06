import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type LabNarrativeGlobal = typeof globalThis & {
  __labNarrativeBrowserSupabase?: SupabaseClient;
};

const globalClient = globalThis as LabNarrativeGlobal;

function createBrowserClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error("The public Supabase configuration is missing.");
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  });
}

export const browserSupabase =
  globalClient.__labNarrativeBrowserSupabase ?? createBrowserClient();

globalClient.__labNarrativeBrowserSupabase = browserSupabase;
