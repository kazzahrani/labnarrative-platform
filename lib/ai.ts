import { QuoteDraft } from "@/lib/quote";

const quoteSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    customer: { type: "string" },
    phone: { anyOf: [{ type: "string" }, { type: "null" }] },
    items: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          description: { type: "string" },
          descriptionAr: { type: "string" },
          quantity: { type: "number", minimum: 0 },
          unitPrice: { type: "number", minimum: 0 }
        },
        required: ["description", "descriptionAr", "quantity", "unitPrice"]
      }
    },
    discount: { type: "number", minimum: 0 },
    vatRate: { type: "number", minimum: 0, maximum: 100 },
    notes: { anyOf: [{ type: "string" }, { type: "null" }] }
  },
  required: ["customer", "phone", "items", "discount", "vatRate", "notes"]
};

function responseText(data: any): string {
  if (typeof data?.output_text === "string") return data.output_text;
  const parts: string[] = [];
  for (const output of data?.output || []) {
    for (const content of output?.content || []) {
      if (typeof content?.text === "string") parts.push(content.text);
      if (typeof content?.json === "string") parts.push(content.json);
      if (content?.json && typeof content.json === "object") parts.push(JSON.stringify(content.json));
    }
  }
  return parts.join("\n").trim();
}

export async function parseQuoteWithAI(input: string): Promise<QuoteDraft | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.OPENAI_QUOTE_MODEL || "gpt-5.6-luna",
      input: [
        {
          role: "system",
          content: [{
            type: "input_text",
            text: [
              "You extract Saudi business quotation drafts from messy Arabic, English, or mixed Arabic-English messages.",
              "Never invent a price that was not supplied. If an item has no stated price, use 0.",
              "Preserve quantities and unit prices exactly. Default VAT to 15 only when VAT is not specified.",
              "Use a concise English description and a concise Arabic description for every line item.",
              "Return only the structured output requested."
            ].join(" ")
          }]
        },
        { role: "user", content: [{ type: "input_text", text: input }] }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "quote_draft",
          strict: true,
          schema: quoteSchema
        }
      },
      max_output_tokens: 1200
    }),
    cache: "no-store"
  });

  if (!response.ok) throw new Error(`OpenAI quote extraction failed (${response.status})`);
  const data = await response.json();
  const raw = responseText(data);
  if (!raw) throw new Error("OpenAI returned no quotation output");

  const parsed = JSON.parse(raw);
  return {
    customer: String(parsed.customer || "New customer"),
    phone: parsed.phone ? String(parsed.phone) : undefined,
    items: (parsed.items || []).map((item: any) => ({
      id: crypto.randomUUID(),
      description: String(item.description || "Item"),
      descriptionAr: String(item.descriptionAr || "بند"),
      quantity: Number(item.quantity || 0),
      unitPrice: Number(item.unitPrice || 0)
    })),
    discount: Number(parsed.discount || 0),
    vatRate: Number(parsed.vatRate ?? 15),
    notes: parsed.notes ? String(parsed.notes) : undefined
  };
}
