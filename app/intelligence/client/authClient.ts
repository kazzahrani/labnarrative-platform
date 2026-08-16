"use client";

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://umhkpflyzlifiufvejwr.supabase.co";
const publishableKey = "sb_publishable_KhXFWNAqu6ErI3dusF-p7Q_nzfJ64lU";

export const intelligenceAuth = createClient(supabaseUrl, publishableKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

export const intelligenceFunctionsBase = `${supabaseUrl}/functions/v1`;
