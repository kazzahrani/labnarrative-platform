"use client";

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://umhkpflyzlifiufvejwr.supabase.co";
const publishableKey = "sb_publishable_KhXFWNAqu6ErI3dusF-p7Q_nzfJ64lU";

// Client-portal authentication must never share the default Supabase browser
// storage key used by LabNarrative administration. Keeping a separate storage
// namespace allows an Intelligence client and an administrator to be signed in
// concurrently on labnarrative.com without either session replacing the other.
const intelligenceClientStorageKey = "labnarrative-intelligence-client-auth";

export const intelligenceAuth = createClient(supabaseUrl, publishableKey, {
  auth: {
    storageKey: intelligenceClientStorageKey,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export const intelligenceFunctionsBase = `${supabaseUrl}/functions/v1`;
