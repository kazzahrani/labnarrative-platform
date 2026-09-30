export type QuoteItem = {
  id: string;
  description: string;
  descriptionAr?: string;
  quantity: number;
  unitPrice: number;
};

export type QuoteDraft = {
  customer: string;
  phone?: string;
  items: QuoteItem[];
  discount: number;
  vatRate: number;
  notes?: string;
};

export function calculateQuote(draft: QuoteDraft) {
  const gross = draft.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const subtotal = Math.max(0, gross - draft.discount);
  const vat = subtotal * (draft.vatRate / 100);
  const total = subtotal + vat;
  return { gross, subtotal, vat, total };
}

export const demoDraft: QuoteDraft = {
  customer: "Khaled Alzahrani",
  phone: "+966 5X XXX XXXX",
  items: [
    { id: "1", description: "Split AC installation", descriptionAr: "تركيب مكيف سبليت", quantity: 4, unitPrice: 450 },
    { id: "2", description: "Copper piping", descriptionAr: "تمديد نحاس", quantity: 20, unitPrice: 75 },
    { id: "3", description: "Transport", descriptionAr: "نقل", quantity: 1, unitPrice: 200 }
  ],
  discount: 0,
  vatRate: 15,
  notes: "Quotation valid for 7 days."
};

export function parseDemoInput(input: string): QuoteDraft {
  const customerMatch = input.match(/(?:for|customer|للعميل|لـ|ل)(?:\s*[:：-])?\s*([\p{L}][\p{L}\s]{1,30})/iu);
  const customer = customerMatch?.[1]?.trim() || (/[أ-ي]/.test(input) ? "عميل جديد" : "New customer");
  const items: QuoteItem[] = [];

  const patterns = [
    { re: /(\d+)\s*(?:مكيف|مكيفات|ac(?:s)?)\D{0,22}?(\d+(?:\.\d+)?)/giu, en: "AC installation", ar: "تركيب مكيف" },
    { re: /(\d+)\s*(?:متر|m)\s*(?:نحاس|copper)\D{0,18}?(\d+(?:\.\d+)?)/giu, en: "Copper piping / meter", ar: "تمديد نحاس / متر" },
    { re: /(\d+)\s*(?:تنظيف|cleaning)\D{0,18}?(\d+(?:\.\d+)?)/giu, en: "AC cleaning", ar: "تنظيف مكيف" }
  ];

  for (const p of patterns) {
    let match: RegExpExecArray | null;
    while ((match = p.re.exec(input))) {
      items.push({ id: crypto.randomUUID(), description: p.en, descriptionAr: p.ar, quantity: Number(match[1]), unitPrice: Number(match[2]) });
    }
  }

  const transport = input.match(/(?:نقل|transport)\D{0,10}?(\d+(?:\.\d+)?)/iu);
  if (transport) items.push({ id: crypto.randomUUID(), description: "Transport", descriptionAr: "نقل", quantity: 1, unitPrice: Number(transport[1]) });

  const discount = Number(input.match(/(?:خصم|discount)\D{0,8}?(\d+(?:\.\d+)?)/iu)?.[1] || 0);
  const vatRate = Number(input.match(/(?:ضريبة|vat)\D{0,8}?(\d+(?:\.\d+)?)/iu)?.[1] || 15);

  if (!items.length) return { ...demoDraft, customer };
  return { customer, items, discount, vatRate };
}
