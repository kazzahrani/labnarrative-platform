import { NextResponse } from "next/server";
import { QuoteDraft } from "@/lib/quote";
import { databaseConfigured, listQuotes, saveQuote } from "@/lib/supabase-rest";

const fallback = [
  { quote_number: "Q-1047", customer_name: "Al Noor Contracting", total: 12640, status: "sent", created_at: new Date().toISOString() },
  { quote_number: "Q-1046", customer_name: "Abdullah Alotaibi", total: 4025, status: "accepted", created_at: new Date().toISOString() },
  { quote_number: "Q-1045", customer_name: "Rawafid Co.", total: 28920, status: "draft", created_at: new Date().toISOString() },
  { quote_number: "Q-1044", customer_name: "Fahad Alqahtani", total: 7130, status: "sent", created_at: new Date().toISOString() }
];

export async function GET() {
  if (!databaseConfigured()) return NextResponse.json({ quotes: fallback, mode: "demo" });
  try {
    const quotes = await listQuotes();
    return NextResponse.json({ quotes, mode: "database" });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ quotes: fallback, mode: "fallback" });
  }
}

export async function POST(request: Request) {
  if (!databaseConfigured()) {
    return NextResponse.json({ error: "Database is not configured yet." }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const draft = body?.draft as QuoteDraft | undefined;
  if (!draft?.customer || !Array.isArray(draft.items) || !draft.items.length) {
    return NextResponse.json({ error: "A valid quotation draft is required." }, { status: 400 });
  }

  try {
    const quote = await saveQuote(
      draft,
      typeof body?.sourceText === "string" ? body.sourceText : undefined,
      typeof body?.sourceType === "string" ? body.sourceType : "text"
    );
    return NextResponse.json({ quote });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Could not save quotation." }, { status: 500 });
  }
}
