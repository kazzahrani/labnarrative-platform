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
      // Avoid navigator.locks deadlocks that can leave getSession() and every
      // authenticated function invocation pending forever in the Trader shell.
      // Supabase still owns session persistence/refresh; this only removes the
      // browser cross-tab lock as a startup dependency.
      lock: async (_name, _acquireTimeout, fn) => await fn(),
    },
  });
}

export const browserSupabase =
  globalClient.__labNarrativeBrowserSupabase ?? createBrowserClient();

globalClient.__labNarrativeBrowserSupabase = browserSupabase;
