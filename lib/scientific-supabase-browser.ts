import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type ScientificGlobal = typeof globalThis & {
  __labNarrativeScientificSupabase?: SupabaseClient;
};

const globalClient = globalThis as ScientificGlobal;

function createScientificClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SCIENTIFIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SCIENTIFIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error("The scientific website Supabase configuration is missing.");
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  });
}

export const scientificSupabase =
  globalClient.__labNarrativeScientificSupabase ?? createScientificClient();

globalClient.__labNarrativeScientificSupabase = scientificSupabase;
