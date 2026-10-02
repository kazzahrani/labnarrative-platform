"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type PVOSGlobal = typeof globalThis & { __pvosSupabase?: SupabaseClient };
const g = globalThis as PVOSGlobal;

const url = process.env.NEXT_PUBLIC_PVOS_SUPABASE_URL ?? "https://kvhmxjfenjtzfavyhnvb.supabase.co";
const key = process.env.NEXT_PUBLIC_PVOS_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_3x3ll4gYAdqi9TAnPzNnMA_BxJKNM8D";

function makeClient() {
  return createClient(url, key, {
    auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true },
  });
}

export const pvosSupabase = g.__pvosSupabase ?? makeClient();
g.__pvosSupabase = pvosSupabase;
