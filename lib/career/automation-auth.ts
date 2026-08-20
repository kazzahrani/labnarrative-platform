import { createHash, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

const CONFIG_KEY = "scheduler";

function bearerToken(request: Request) {
  const header = request.headers.get("authorization")?.trim() || "";
  if (!header.toLowerCase().startsWith("bearer ")) return null;
  const token = header.slice(7).trim();
  return token || null;
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function authorizeCareerAutomation(request: Request, supabase: SupabaseClient) {
  const token = bearerToken(request);
  if (!token) return false;

  const envSecret = process.env.CRON_SECRET?.trim();
  if (envSecret && safeEqual(sha256(token), sha256(envSecret))) return true;

  const { data, error } = await supabase
    .from("career_automation_config")
    .select("secret_sha256,enabled")
    .eq("key", CONFIG_KEY)
    .maybeSingle();

  if (error || !data?.enabled || !data?.secret_sha256) return false;
  return safeEqual(sha256(token), String(data.secret_sha256));
}
