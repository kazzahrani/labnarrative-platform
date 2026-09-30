import { calculateQuote, QuoteDraft } from "@/lib/quote";

const url = () => (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const key = () => process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const businessId = () => process.env.THRWA_BUSINESS_ID || "";

export function databaseConfigured() {
  return Boolean(url() && key() && businessId());
}

async function rest(path: string, init?: RequestInit) {
  if (!databaseConfigured()) throw new Error("THRWA database is not configured");
  const response = await fetch(`${url()}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key(),
      Authorization: `Bearer ${key()}`,
      "Content-Type": "application/json",
      ...(init?.headers || {})
    },
    cache: "no-store"
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Supabase request failed (${response.status}): ${text.slice(0, 300)}`);
  }
  if (response.status === 204) return null;
  return response.json();
}

export async function listQuotes(limit = 20) {
  return rest(
    `quotes?business_id=eq.${encodeURIComponent(businessId())}&select=id,quote_number,public_token,customer_name,status,total,created_at,sent_at,accepted_at&order=created_at.desc&limit=${limit}`
  );
}

export async function listCatalog() {
  return rest(
    `catalog_items?business_id=eq.${encodeURIComponent(businessId())}&active=eq.true&select=id,name,name_ar,unit,unit_price&order=created_at.asc`
  );
}

export async function saveQuote(draft: QuoteDraft, sourceText?: string, sourceType = "text") {
  const totals = calculateQuote(draft);
  const quoteNumber = `Q-${Date.now().toString().slice(-7)}`;

  const created = await rest("quotes", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      business_id: businessId(),
      quote_number: quoteNumber,
      customer_name: draft.customer,
      customer_phone: draft.phone || null,
      status: "draft",
      discount: draft.discount,
      vat_rate: draft.vatRate,
      subtotal: totals.subtotal,
      vat: totals.vat,
      total: totals.total,
      source_text: sourceText || null,
      source_type: sourceType
    })
  });

  const quote = Array.isArray(created) ? created[0] : created;
  if (!quote?.id) throw new Error("Quote was created without an id");

  if (draft.items.length) {
    await rest("quote_items", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(draft.items.map((item, index) => ({
        quote_id: quote.id,
        description: item.description,
        description_ar: item.descriptionAr || null,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        line_total: item.quantity * item.unitPrice,
        sort_order: index
      })))
    });
  }

  return quote;
}


export async function getPublicQuote(publicToken: string) {
  const rows = await rest(
    `quotes?public_token=eq.${encodeURIComponent(publicToken)}&select=id,quote_number,public_token,customer_name,customer_phone,status,discount,vat_rate,subtotal,vat,total,created_at,sent_at,accepted_at&limit=1`
  );
  const quote = Array.isArray(rows) ? rows[0] : null;
  if (!quote?.id) return null;

  const items = await rest(
    `quote_items?quote_id=eq.${encodeURIComponent(quote.id)}&select=id,description,description_ar,quantity,unit_price,line_total,sort_order&order=sort_order.asc`
  );

  return { ...quote, items: Array.isArray(items) ? items : [] };
}

export async function updatePublicQuoteStatus(publicToken: string, status: "accepted" | "rejected") {
  const body: Record<string, unknown> = { status };
  if (status === "accepted") body.accepted_at = new Date().toISOString();

  const rows = await rest(
    `quotes?public_token=eq.${encodeURIComponent(publicToken)}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(body)
    }
  );

  return Array.isArray(rows) ? rows[0] : rows;
}
