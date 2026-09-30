import { NextResponse } from "next/server";
import { databaseConfigured, getPublicQuote, updatePublicQuoteStatus } from "@/lib/supabase-rest";

const demoQuote = {
  quote_number: "Q-DEMO",
  public_token: "demo",
  customer_name: "خالد",
  status: "sent",
  discount: 0,
  vat_rate: 15,
  subtotal: 3500,
  vat: 525,
  total: 4025,
  created_at: new Date().toISOString(),
  items: [
    { id: "1", description: "Split AC installation", description_ar: "تركيب مكيف سبليت", quantity: 4, unit_price: 450, line_total: 1800 },
    { id: "2", description: "Copper piping / meter", description_ar: "تمديد نحاس / متر", quantity: 20, unit_price: 75, line_total: 1500 },
    { id: "3", description: "Transport", description_ar: "نقل", quantity: 1, unit_price: 200, line_total: 200 }
  ]
};

export async function GET(_: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  if (!databaseConfigured()) {
    if (token === "demo") return NextResponse.json({ quote: demoQuote, mode: "demo" });
    return NextResponse.json({ error: "Quote not available." }, { status: 404 });
  }

  try {
    const quote = await getPublicQuote(token);
    if (!quote) return NextResponse.json({ error: "Quote not found." }, { status: 404 });
    return NextResponse.json({ quote, mode: "database" });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Could not load quote." }, { status: 500 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const body = await request.json().catch(() => ({}));
  const action = body?.action === "accept" ? "accepted" : body?.action === "reject" ? "rejected" : null;
  if (!action) return NextResponse.json({ error: "Invalid action." }, { status: 400 });

  if (!databaseConfigured()) {
    if (token === "demo") return NextResponse.json({ quote: { ...demoQuote, status: action }, mode: "demo" });
    return NextResponse.json({ error: "Quote not available." }, { status: 404 });
  }

  try {
    const quote = await updatePublicQuoteStatus(token, action);
    if (!quote) return NextResponse.json({ error: "Quote not found." }, { status: 404 });
    return NextResponse.json({ quote });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Could not update quote." }, { status: 500 });
  }
}
