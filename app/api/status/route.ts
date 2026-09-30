import { NextResponse } from "next/server";
import { databaseConfigured } from "@/lib/supabase-rest";

export async function GET() {
  return NextResponse.json({
    ai: Boolean(process.env.OPENAI_API_KEY),
    voice: Boolean(process.env.OPENAI_API_KEY),
    whatsapp: Boolean(
      process.env.WHATSAPP_ACCESS_TOKEN &&
      process.env.WHATSAPP_PHONE_NUMBER_ID &&
      process.env.WHATSAPP_VERIFY_TOKEN
    ),
    database: databaseConfigured()
  });
}
