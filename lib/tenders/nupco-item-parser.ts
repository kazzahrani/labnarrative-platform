export type NupcoExtractedItem = {
  line_number: number;
  item_code: string | null;
  description: string;
  quantity: number | null;
  unit: string | null;
  raw_text: string;
  extraction_confidence: number;
  source_sheet: string | null;
};

const rowStart = /^\d{1,6}\s+[A-Z]{2,}[A-Z0-9-]*\s+\d{8,16}\s+/i;
const units = [
  "EACH", "EA", "PCS", "PC", "PIECE", "PIECES", "BOX", "PACK", "PK", "KIT", "SET", "PAIR",
  "ROLL", "BOTTLE", "VIAL", "BAG", "CAN", "TUBE", "CARTRIDGE", "TEST", "DOSE", "UNIT", "UNITS",
  "LTR", "LITER", "LITRE", "ML", "KG", "GM", "G", "METER", "METRE",
];
const unitPattern = units.join("|");

function clean(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function isBoilerplate(line: string) {
  const value = clean(line);
  if (!value) return true;
  if (/^www\.nupco\.com\s+Page\s+\d+\s+of\s+\d+/i.test(value)) return true;
  if (/^(LABORATORY|ITEM LIST)$/i.test(value)) return true;
  if (/^SN\s+ITEM NO\s+NUPCO CODE\s+ITEM DESCRIPTION\s+UOM\s+QTY\s+GROUPS$/i.test(value)) return true;
  return false;
}

function parseQuantity(value: string | undefined) {
  if (!value) return null;
  const number = Number(value.replace(/,/g, ""));
  return Number.isFinite(number) ? number : null;
}

export function parseNupcoItemList(text: string, maxItems = 2000): NupcoExtractedItem[] {
  if (!/NUPCO CODE\s+ITEM DESCRIPTION/i.test(text)) return [];

  const lines = text.split(/\r?\n/).map(clean).filter(Boolean);
  const rows: string[] = [];
  let current = "";

  for (const line of lines) {
    if (isBoilerplate(line)) continue;
    if (rowStart.test(line)) {
      if (current) rows.push(current);
      current = line;
      continue;
    }
    if (current) current = `${current} ${line}`;
  }
  if (current) rows.push(current);

  const output: NupcoExtractedItem[] = [];
  for (const raw of rows) {
    if (output.length >= maxItems) break;
    const match = raw.match(/^(\d{1,6})\s+([A-Z]{2,}[A-Z0-9-]*)\s+(\d{8,16})\s+(.+)$/i);
    if (!match) continue;

    const serial = Number(match[1]);
    const internalItemNo = match[2];
    const nupcoCode = match[3];
    let description = clean(match[4]);
    let unit: string | null = null;
    let quantity: number | null = null;
    let group: string | null = null;
    let confidence = 0.9;

    const structuredTail = description.match(new RegExp(`^(.*?)\\s+(${unitPattern})\\s+([0-9][0-9,.]*)\\s+([A-Z0-9-]+)\\s*$`, "i"));
    if (structuredTail) {
      description = clean(structuredTail[1]);
      unit = structuredTail[2].toUpperCase();
      quantity = parseQuantity(structuredTail[3]);
      group = structuredTail[4];
      confidence = 0.98;
    } else {
      const looseTail = description.match(/^(.*?)\s+-?\s+([0-9][0-9,.]*)\s+([A-Z]{2,}[A-Z0-9-]*)\s*$/i);
      if (looseTail) {
        description = clean(looseTail[1]);
        quantity = parseQuantity(looseTail[2]);
        group = looseTail[3];
        confidence = 0.94;
      }
    }

    if (description.length < 4 || !/[A-Za-z\u0600-\u06ff]/.test(description)) continue;
    output.push({
      line_number: Number.isFinite(serial) ? serial : output.length + 1,
      item_code: nupcoCode,
      description,
      quantity,
      unit,
      raw_text: [internalItemNo, nupcoCode, description, unit, quantity, group].filter((value) => value !== null && value !== undefined && value !== "").join(" | "),
      extraction_confidence: confidence,
      source_sheet: null,
    });
  }

  return output;
}
