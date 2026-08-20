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

export type NupcoItemListPage = {
  items: NupcoExtractedItem[];
  totalDetected: number;
  offset: number;
  limit: number;
  truncated: boolean;
};

const rowStart = /^\d{1,6}\s+[A-Z]{2,}[A-Z0-9-]*\s+\d{8,16}\s+/i;
const genericCodedRowStart = /^(\d{1,6})\s+(\d{13})(?:\s+.*)?$/i;
const codeFirstRowStart = /^(\d{13})(?:\s+.*)?$/i;
const units = [
  "EACH", "EA", "PCS", "PC", "PIECE", "PIECES", "BOX", "PACK", "PK", "KIT", "SET", "PAIR",
  "ROLL", "BOTTLE", "VIAL", "BAG", "CAN", "TUBE", "CARTRIDGE", "TEST", "DOSE", "UNIT", "UNITS",
  "LTR", "LITER", "LITRE", "ML", "KG", "GM", "G", "METER", "METRE", "CANISTER", "SACHET", "AMP",
  "TAB", "PFS", "BT", "CAP", "TUB", "VIA", "AMPOULE", "SYRINGE", "STRIP",
];
const unitPattern = units.join("|");

function clean(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function isBoilerplate(line: string) {
  const value = clean(line);
  if (!value) return true;
  if (/^www\.nupco\.\s*com(?:\s+Page\s+\d+\s+of\s+\d+)?$/i.test(value)) return true;
  if (/^--\s*\d+\s+of\s+\d+\s*--$/i.test(value)) return true;
  if (/^\d+\s+of\s+\d+$/i.test(value)) return true;
  if (/^\d{1,2}[.\-][A-Z]{3}[.\-]\d{4}$/i.test(value)) return true;
  if (/^[A-Z][a-z]+\s+\d{1,2},\s+\d{4}$/i.test(value)) return true;
  if (/^NUPCO\s+TENDER:\s*NPT\s*\d+\s*\/\s*\d+$/i.test(value)) return true;
  if (/^(LABORATORY|ITEM LIST)$/i.test(value)) return true;
  if (/^SN\s+ITEM NO\s+NUPCO CODE\s+ITEM DESCRIPTION\s+UOM\s+QTY\s+GROUPS$/i.test(value)) return true;
  if (/^SN\s+NUPCO(?:\s+GENERIC)?(?:\s+CODE)?(?:\s+GENERIC)?(?:\s+ITEM)?\s*$/i.test(value)) return true;
  if (/^SN\s+NUPCO\s+CODE\s+DESCRIPTION\s+UOM\s+ITEMIZED\s+INITIAL\s+QTY$/i.test(value)) return true;
  if (/^SN\s+NUPCO\s+GENERIC\s+CODE\s+LONG\s+DESCRIPTION\s+UOM\s+GROUP\/ITMZ\s+QTY$/i.test(value)) return true;
  if (/^NUPCO\s+CODE\s+ITEM\s+DESCRIPTION\s+UOM\s+(?:INITIAL\s+QUANTITY|QTY)$/i.test(value)) return true;
  if (/^CODE\s+GENERIC\s+ITEM\s+DESCRIPTION\.?\s+UOM\s+CORRECTED\s+UOM\s+GROUP\s*\/?$/i.test(value)) return true;
  if (/^ITEMIZED\s+INITT?IAL\s+QTY$/i.test(value)) return true;
  if (/^OPEN\s+FRAMEWORK\s+AGREEMENT\s+FOR$/i.test(value)) return true;
  if (/^[A-Z ]+TENDER\s*-?NPT\d{4}-?\d{2}$/i.test(value)) return true;
  return false;
}

function parseQuantity(value: string | undefined) {
  if (!value) return null;
  const number = Number(value.replace(/,/g, ""));
  return Number.isFinite(number) ? number : null;
}

function collectRows(text: string) {
  if (!/NUPCO CODE\s+ITEM DESCRIPTION/i.test(text)) return [] as string[];
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
  return rows;
}

function collectGenericCodedRows(text: string) {
  if (!/\b(?:ITEMIZED|ITMZ)\b/i.test(text) || !/\bNUPCO\b/i.test(text)) return [] as string[];
  const lines = text.split(/\r?\n/).map(clean).filter(Boolean);
  const rows: string[] = [];
  let current = "";

  for (const line of lines) {
    if (isBoilerplate(line)) continue;
    if (genericCodedRowStart.test(line)) {
      if (current) rows.push(current);
      current = line;
      continue;
    }
    if (current) current = `${current} ${line}`;
  }
  if (current) rows.push(current);
  return rows;
}

function collectCodeFirstRows(text: string) {
  if (!/NUPCO\s+CODE\s+ITEM\s+DESCRIPTION\s+UOM\s+(?:INITIAL\s+QUANTITY|QTY)/i.test(text)) return [] as string[];
  const lines = text.split(/\r?\n/).map(clean).filter(Boolean);
  const rows: string[] = [];
  let current = "";

  for (const line of lines) {
    if (isBoilerplate(line)) continue;
    if (codeFirstRowStart.test(line)) {
      if (current) rows.push(current);
      current = line;
      continue;
    }
    if (current) current = `${current} ${line}`;
  }
  if (current) rows.push(current);
  return rows;
}

function parseRow(raw: string, globalLineNumber: number): NupcoExtractedItem | null {
  const match = raw.match(/^(\d{1,6})\s+([A-Z]{2,}[A-Z0-9-]*)\s+(\d{8,16})\s+(.+)$/i);
  if (!match) return null;

  const sourceSerial = Number(match[1]);
  const internalItemNo = match[2];
  const nupcoCode = match[3];
  let description = clean(match[4]).replace(/\s+--\s*\d+\s+of\s+\d+\s*--\s*$/i, "").trim();
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

  if (description.length < 4 || !/[A-Za-z\u0600-\u06ff]/.test(description)) return null;
  return {
    line_number: globalLineNumber,
    item_code: nupcoCode,
    description,
    quantity,
    unit,
    raw_text: [Number.isFinite(sourceSerial) ? `SN ${sourceSerial}` : null, internalItemNo, nupcoCode, description, unit, quantity, group]
      .filter((value) => value !== null && value !== undefined && value !== "")
      .join(" | "),
    extraction_confidence: confidence,
    source_sheet: null,
  };
}

function parseGenericCodedRow(raw: string, globalLineNumber: number): NupcoExtractedItem | null {
  const match = raw.match(/^(\d{1,6})\s+(\d{13})(?:\s+(.+))?$/i);
  if (!match) return null;

  const sourceSerial = Number(match[1]);
  const nupcoCode = match[2];
  const combined = clean(match[3] ?? "");
  if (!combined) return null;
  let description = combined;
  let quantity: number | null = null;
  let unit: string | null = null;
  let confidence = 0.84;

  const markedTail = combined.match(/^(.*?)\s+([A-Z][A-Z0-9/-]{1,15})\s+(?:ITEMIZED|ITMZ)\s+([0-9][0-9,.]*)\s*$/i);
  if (markedTail) {
    description = clean(markedTail[1]);
    unit = markedTail[2].toUpperCase();
    quantity = parseQuantity(markedTail[3]);
    confidence = 0.96;
  } else {
    const quantityOnly = combined.match(/^(.*?)\s+(?:ITEMIZED|ITMZ)\s+([0-9][0-9,.]*)\s*$/i);
    if (quantityOnly) {
      description = clean(quantityOnly[1]);
      quantity = parseQuantity(quantityOnly[2]);
      confidence = 0.92;
    }
  }

  description = clean(description)
    .replace(/\s+(?:ITEMIZED|ITMZ)\s*$/i, "")
    .replace(/\s+CORRECTED\s+UOM\s*$/i, "")
    .trim();

  if (description.length < 4 || !/[A-Za-z\u0600-\u06ff]/.test(description)) return null;
  return {
    line_number: globalLineNumber,
    item_code: nupcoCode,
    description,
    quantity,
    unit,
    raw_text: [Number.isFinite(sourceSerial) ? `SN ${sourceSerial}` : null, nupcoCode, combined]
      .filter((value) => value !== null && value !== undefined && value !== "")
      .join(" | "),
    extraction_confidence: confidence,
    source_sheet: null,
  };
}

function parseCodeFirstRow(raw: string, globalLineNumber: number): NupcoExtractedItem | null {
  const match = raw.match(/^(\d{13})\s+(.+)$/i);
  if (!match) return null;

  const nupcoCode = match[1];
  const combined = clean(match[2]);
  let description = combined;
  let quantity: number | null = null;
  let unit: string | null = null;
  let confidence = 0.86;

  const structuredTail = combined.match(new RegExp(`^(.*?)\\s+(${unitPattern})\\s+([0-9][0-9,.]*)\\s*$`, "i"));
  if (structuredTail) {
    description = clean(structuredTail[1]);
    unit = structuredTail[2].toUpperCase();
    quantity = parseQuantity(structuredTail[3]);
    confidence = 0.97;
  }

  if (description.length < 4 || !/[A-Za-z\u0600-\u06ff]/.test(description)) return null;
  return {
    line_number: globalLineNumber,
    item_code: nupcoCode,
    description,
    quantity,
    unit,
    raw_text: [nupcoCode, combined].join(" | "),
    extraction_confidence: confidence,
    source_sheet: null,
  };
}

export function parseNupcoItemListPage(text: string, offset = 0, limit = 2000): NupcoItemListPage {
  const safeOffset = Math.max(0, Math.floor(offset || 0));
  const safeLimit = Math.max(1, Math.floor(limit || 1));

  const structured = collectRows(text)
    .map((row, index) => parseRow(row, index + 1))
    .filter((item): item is NupcoExtractedItem => item !== null);

  const genericCoded = structured.length
    ? []
    : collectGenericCodedRows(text)
        .map((row, index) => parseGenericCodedRow(row, index + 1))
        .filter((item): item is NupcoExtractedItem => item !== null);

  const parsed = structured.length
    ? structured
    : genericCoded.length
      ? genericCoded
      : collectCodeFirstRows(text)
          .map((row, index) => parseCodeFirstRow(row, index + 1))
          .filter((item): item is NupcoExtractedItem => item !== null);

  const totalDetected = parsed.length;
  const items = parsed.slice(safeOffset, safeOffset + safeLimit);
  return {
    items,
    totalDetected,
    offset: safeOffset,
    limit: safeLimit,
    truncated: safeOffset + items.length < totalDetected,
  };
}

export function parseNupcoItemList(text: string, maxItems = 2000): NupcoExtractedItem[] {
  return parseNupcoItemListPage(text, 0, maxItems).items;
}
