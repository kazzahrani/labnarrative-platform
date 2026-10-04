"use client";

import { scientificSupabase as supabase } from "@/lib/scientific-supabase-browser";

const STORAGE_KEY = "labnarrative-scientific-admin-session-v1";

export function getScientificAdminToken() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(STORAGE_KEY) || "";
}

export function setScientificAdminToken(token: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, token);
}

export function clearScientificAdminToken() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}

export async function scientificAdminSessionIsValid() {
  const token = getScientificAdminToken();
  if (!token) return false;
  const { data, error } = await supabase.rpc("scientific_admin_custom_session", { p_token: token });
  if (error || data?.ok !== true) {
    clearScientificAdminToken();
    return false;
  }
  return true;
}

export async function scientificAdminLogin(email: string, password: string) {
  const { data, error } = await supabase.rpc("scientific_admin_custom_login", {
    p_email: email.trim(),
    p_password: password,
  });
  if (error) return { ok: false, error: error.message };
  if (data?.ok !== true || !data?.session_token) return { ok: false, error: data?.error || "Sign in failed." };
  setScientificAdminToken(String(data.session_token));
  return { ok: true, error: "" };
}

export async function scientificAdminLogout() {
  const token = getScientificAdminToken();
  clearScientificAdminToken();
  if (!token) return;
  await supabase.rpc("scientific_admin_custom_logout", { p_token: token });
}
