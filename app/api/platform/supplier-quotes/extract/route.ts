import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Workbook } from "exceljs";
import { PDFParse } from "pdf-parse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_ROWS = 1000;

type ParsedRow = {
  source_row_number: number;
  source_sheet: string | null;
  source_page: number | null;
  raw_text: string;
  item_code: string | null;
  description: string | null;
  quantity: number | null;
  unit: string | null;
  unit_cost: number | null;
  moq: number | null;
  lead_time_days: number | null;
  manufacturer: string | null;
  catalog_no: string | null;
  extraction_confidence: number;
};

type SourcingRow = {
  sourcing_id: string;
  requirement_id: string;
  item_code: string | null;
  requested_item: string;
  quantity: number | null;
  unit: string | null;
  suggested_manufacturer: string | null;
  suggested_catalog_no: string | null;
};

type MappedRow = ParsedRow & {
  matched_sourcing_id: string | null;
  matched_requirement_id: string | null;
  match_method: string | null;
  match_confidence: number;
};

type Field = "code" | "description" | "quantity" | "unit" | "unitCost" | "moq" | "lead" | "manufacturer" | "catalog";

function normalize(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const aliasSource: Record<Field, string[]> = {
  code: ["nupco code","generic code","item code","product code","sku","code","material code","رقم الصنف","كود الصنف","كود نوبكو","الكود العام"],
  description: ["description","item description","product description","item","product","material","details","الوصف","وصف الصنف","اسم الصنف","الصنف","البيان"],
  quantity: ["quantity","qty","offered quantity","offer qty","الكمية","كميه","العدد"],
  unit: ["unit","uom","unit of measure","الوحدة","وحدة"],
  unitCost: ["unit price","unit cost","price per unit","rate","price","cost","سعر الوحدة","سعر الوحده","السعر","التكلفة","تكلفه الوحدة"],
  moq: ["moq","minimum order quantity","minimum quantity","min qty","الحد الادنى للطلب","اقل كمية"],
  lead: ["lead time","lead time days","delivery days","delivery time","days","مدة التوريد","مدة التسليم","ايام التوريد"],
  manufacturer: ["manufacturer","maker","brand manufacturer","الشركة المصنعة","المصنع"],
  catalog: ["catalog no","catalog number","catalogue no","catalogue number","manufacturer part number","mpn","part no","part number","cat no","رقم الكتالوج","رقم المصنع","رقم الجزء"],
};
const aliases = Object.fromEntries(Object.entries(aliasSource).map(([k,v])=>[k,new Set(v.map(normalize))])) as Record<Field,Set<string>>;

function asText(value: unknown) {
  if (value == null) return "";
  if (typeof value === "object") {
    const rich=(value as {richText?:Array<{text?:string}>}).richText;
    if (Array.isArray(rich)) return rich.map(x=>x.text??"").join("").trim();
    const text=(value as {text?:unknown}).text;
    if (typeof text === "string") return text.trim();
    const result=(value as {result?:unknown}).result;
    if (result !== undefined) return String(result).trim();
  }
  return String(value).trim();
}

function asNumber(value: unknown) {
  const raw=String(value??"").trim();
  if (!raw) return null;
  const cleaned=raw.replace(/\s/g,"").replace(/,/g,"").replace(/^(sar|usd|eur|aed|riyal|rs\.?)/i,"").replace(/[^0-9.+-]/g,"");
  if (!cleaned || cleaned==="." || cleaned==="-" || cleaned==="+") return null;
  const n=Number(cleaned);
  return Number.isFinite(n)?n:null;
}

function headerField(cell: string): Field | null {
  const n=normalize(cell);
  if (!n) return null;
  const entries=Object.entries(aliases) as Array<[Field,Set<string>]>;
  for (const [field,set] of entries) if (set.has(n)) return field;
  let best:{field:Field;length:number}|null=null;
  for (const [field,set] of entries) {
    for (const alias of set) {
      if (alias.length<5 || !n.includes(alias)) continue;
      if (!best || alias.length>best.length) best={field,length:alias.length};
    }
  }
  return best?.field??null;
}

function detectTable(rows: string[][]) {
  let best: {rowIndex:number; map:Partial<Record<Field,number>>; score:number}|null=null;
  for (let rowIndex=0;rowIndex<Math.min(rows.length,35);rowIndex++) {
    const map:Partial<Record<Field,number>>={};
    rows[rowIndex].forEach((cell,index)=>{const f=headerField(cell);if(f && map[f]===undefined) map[f]=index;});
    const hasPrice=map.unitCost!==undefined;
    const hasIdentity=map.description!==undefined || map.code!==undefined || map.catalog!==undefined;
    if (!hasPrice || !hasIdentity) continue;
    const score=Object.keys(map).length*10+(map.description!==undefined?5:0)+(map.code!==undefined?4:0)+(map.unitCost!==undefined?8:0);
    if (!best || score>best.score) best={rowIndex,map,score};
  }
  return best;
}

function parseTableRows(rows:string[][],sheet:string|null) {
  const detected=detectTable(rows);
  if (!detected) return [] as ParsedRow[];
  const out:ParsedRow[]=[];
  const get=(row:string[],field:Field)=>detected.map[field]===undefined?"":(row[detected.map[field]!]??"").trim();
  for (let i=detected.rowIndex+1;i<rows.length && out.length<MAX_ROWS;i++) {
    const row=rows[i].map(x=>x.trim());
    if (!row.some(Boolean)) continue;
    const unitCost=asNumber(get(row,"unitCost"));
    const description=get(row,"description")||null;
    const code=get(row,"code")||null;
    const catalog=get(row,"catalog")||null;
    if (!description && !code && !catalog) continue;
    if (unitCost===null && !description) continue;
    const leadValue=asNumber(get(row,"lead"));
    const confidence=unitCost!==null?(description||code?0.96:0.75):0.58;
    out.push({
      source_row_number:i+1,source_sheet:sheet,source_page:null,raw_text:row.filter(Boolean).join(" | "),
      item_code:code,description,quantity:asNumber(get(row,"quantity")),unit:get(row,"unit")||null,unit_cost:unitCost,
      moq:asNumber(get(row,"moq")),lead_time_days:leadValue===null?null:Math.max(0,Math.round(leadValue)),
      manufacturer:get(row,"manufacturer")||null,catalog_no:catalog,extraction_confidence:confidence,
    });
  }
  return out;
}

async function parseWorkbook(buffer:ArrayBuffer) {
  const workbook=new Workbook();
  await workbook.xlsx.load(Buffer.from(buffer) as never);
  const rows:ParsedRow[]=[]; const sheets:string[]=[];
  workbook.eachSheet(ws=>{
    sheets.push(ws.name);
    const matrix:string[][]=[];
    ws.eachRow({includeEmpty:false},row=>{const vals=Array.isArray(row.values)?row.values.slice(1):[];matrix.push(vals.map(asText));});
    rows.push(...parseTableRows(matrix,ws.name).slice(0,MAX_ROWS-rows.length));
  });
  return {rows,sheets,parser:"exceljs"};
}

function splitDelimited(text:string) {
  const lines=text.split(/\r?\n/).filter(x=>x.trim());
  const sample=lines.slice(0,12).join("\n");
  const delimiters=["\t",",",";","|"];
  const chosen=delimiters.map(d=>({d,n:sample.split(d).length-1})).sort((a,b)=>b.n-a.n)[0]?.d??",";
  return lines.map(line=>line.split(chosen).map(x=>x.trim().replace(/^"|"$/g,"")));
}

function parseDelimited(text:string) { return {rows:parseTableRows(splitDelimited(text),"text"),sheets:["text"],parser:"delimited"}; }

function parsePdfLines(text:string) {
  const lines=text.split(/\r?\n/).map(x=>x.replace(/\s+/g," ").trim()).filter(Boolean);
  const rows:ParsedRow[]=[];
  for (let i=0;i<lines.length && rows.length<MAX_ROWS;i++) {
    const line=lines[i];
    if (/^(total|subtotal|vat|tax|page|quotation|quote|date|terms|الإجمالي|المجموع|الضريبة|صفحة|عرض سعر)/i.test(line)) continue;
    const codeMatch=line.match(/\b\d{8,16}\b/);
    const money=[...line.matchAll(/(?:SAR|USD|EUR|AED|ر\.?س\.?)?\s*(\d{1,9}(?:,\d{3})*(?:\.\d{1,4})?)/gi)].map(m=>({value:Number(m[1].replace(/,/g,"")),index:m.index??0,text:m[0]})).filter(x=>Number.isFinite(x.value));
    if (!codeMatch && money.length<2) continue;
    const tail=money.filter(x=>x.index>Math.floor(line.length*.35));
    if (!tail.length) continue;
    const unitCostCandidate=tail.length>=2?tail[tail.length-2]:tail[tail.length-1];
    if (!(unitCostCandidate.value>0)) continue;
    let description=line;
    if (codeMatch) description=description.replace(codeMatch[0]," ");
    for (const m of tail) description=description.replace(m.text," ");
    description=description.replace(/^\s*\d{1,4}[.)-]?\s*/,"").replace(/\s+/g," ").trim();
    if (description.length<3) description="";
    rows.push({source_row_number:i+1,source_sheet:null,source_page:null,raw_text:line,item_code:codeMatch?.[0]??null,description:description||null,quantity:null,unit:null,unit_cost:unitCostCandidate.value,moq:null,lead_time_days:null,manufacturer:null,catalog_no:null,extraction_confidence:codeMatch?0.72:0.48});
  }
  return rows;
}

async function parsePdf(buffer:ArrayBuffer) {
  const parser=new PDFParse({data:new Uint8Array(buffer)});
  try { const result=await parser.getText(); return {rows:parsePdfLines(result.text??""),sheets:[],parser:"pdf-parse",pages:result.total??null}; }
  finally { await parser.destroy(); }
}

const genericTokens=new Set(["sterile","pack","package","set","kit","box","bag","piece","unit","bottle","vial","tube","each","ea","pcs","pc","medical","product","supply","supplies","the","and","with","for","of","in","to","a","an"]);
function tokens(value:string|null|undefined) {
  return normalize(value).split(" ").filter(t=>t.length>=3 && !genericTokens.has(t) && !/^\d+$/.test(t));
}
function code(value:string|null|undefined){return normalize(value).replace(/\s/g,"");}
function tokenScore(a:string|null,b:string|null) {
  const aa=[...new Set(tokens(a))],bb=[...new Set(tokens(b))]; if (aa.length<2||bb.length<2) return 0;
  const bset=new Set(bb); const common=aa.filter(x=>bset.has(x)).length;
  return Math.max(common/aa.length,common/bb.length)*0.65+(common/Math.max(aa.length,bb.length))*0.35;
}

function mapRow(row:ParsedRow,sourcing:SourcingRow[]):MappedRow {
  const rowCode=code(row.item_code),rowCatalog=code(row.catalog_no);
  if (rowCode) {
    const exact=sourcing.find(s=>code(s.item_code)===rowCode);
    if (exact) return {...row,matched_sourcing_id:exact.sourcing_id,matched_requirement_id:exact.requirement_id,match_method:"item_code_exact",match_confidence:1};
  }
  if (rowCatalog) {
    const exact=sourcing.find(s=>code(s.suggested_catalog_no)===rowCatalog);
    if (exact) return {...row,matched_sourcing_id:exact.sourcing_id,matched_requirement_id:exact.requirement_id,match_method:"catalog_code_exact",match_confidence:.97};
  }
  const ranked=sourcing.map(s=>({s,score:tokenScore(row.description,s.requested_item)})).sort((a,b)=>b.score-a.score);
  const best=ranked[0],second=ranked[1];
  if (best && best.score>=.62 && best.score-(second?.score??0)>=.08) {
    return {...row,matched_sourcing_id:best.s.sourcing_id,matched_requirement_id:best.s.requirement_id,match_method:"description_tokens",match_confidence:Math.min(.9,.55+best.score*.4)};
  }
  return {...row,matched_sourcing_id:null,matched_requirement_id:null,match_method:null,match_confidence:0};
}

export async function POST(request:NextRequest) {
  try {
    const authorization=request.headers.get("authorization")||"";
    const token=authorization.startsWith("Bearer ")?authorization.slice(7).trim():"";
    if (!token) return NextResponse.json({error:"Authentication required."},{status:401});
    const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url||!key) return NextResponse.json({error:"Platform configuration is incomplete."},{status:500});
    const supabase=createClient(url,key,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}});
    const {data:userData,error:userError}=await supabase.auth.getUser(token);
    if (userError||!userData.user) return NextResponse.json({error:"Invalid session."},{status:401});

    const form=await request.formData(); const quoteId=String(form.get("quoteId")||"").trim(); const file=form.get("file");
    if (!quoteId||!(file instanceof File)) return NextResponse.json({error:"Supplier quote and file are required."},{status:400});
    if (file.size<=0) return NextResponse.json({error:"The file is empty."},{status:400});
    if (file.size>MAX_FILE_BYTES) return NextResponse.json({error:"Automatic extraction supports files up to 10 MB."},{status:413});

    const {data:quote,error:quoteError}=await supabase.from("ln_supplier_quote_intakes").select("id,org_id,ln_tender_id,status").eq("id",quoteId).maybeSingle();
    if (quoteError) throw quoteError; if (!quote) return NextResponse.json({error:"Supplier quote intake not found or inaccessible."},{status:404});
    if (!["draft","reviewed"].includes(String(quote.status))) return NextResponse.json({error:"Approved or rejected supplier quotes cannot be re-extracted."},{status:409});

    const {data:sourcingData,error:sourcingError}=await supabase.rpc("ln_get_sourcing_queue",{p_ln_tender_id:quote.ln_tender_id,p_status:"all",p_search:null,p_limit:500,p_offset:0});
    if (sourcingError) throw sourcingError;
    const sourcing=(sourcingData??[]) as SourcingRow[];
    if (!sourcing.length) return NextResponse.json({error:"This tender has no external-sourcing lines to map against."},{status:422});

    const ext=file.name.toLowerCase().split(".").pop()??""; const buffer=await file.arrayBuffer();
    let parsed:{rows:ParsedRow[];sheets:string[];parser:string;pages?:number|null};
    if (ext==="xlsx"||file.type.includes("spreadsheetml")) parsed=await parseWorkbook(buffer);
    else if (["csv","tsv","txt"].includes(ext)||file.type.startsWith("text/")) parsed=parseDelimited(new TextDecoder().decode(buffer));
    else if (ext==="pdf"||file.type==="application/pdf") parsed=await parsePdf(buffer);
    else return NextResponse.json({error:"Automatic extraction supports text-based PDF, XLSX, CSV, TSV and TXT. Other files can still be attached and entered manually."},{status:415});

    if (!parsed.rows.length) return NextResponse.json({error:"No priced supplier line items could be extracted. Keep the file attached and enter the offer manually, or upload a structured XLSX/CSV export.",parser:parsed.parser},{status:422});
    const mapped=parsed.rows.map(r=>mapRow(r,sourcing));
    const validPrice=mapped.filter(r=>(r.unit_cost??0)>0);
    const quality=validPrice.length?validPrice.reduce((sum,r)=>sum+r.extraction_confidence,0)/validPrice.length:0;
    const metadata={sheets:parsed.sheets,pages:parsed.pages??null,source_rows:parsed.rows.length,mapped_rows:mapped.filter(r=>r.matched_sourcing_id).length,matching_policy:"exact item code > exact catalog code > informative description tokens",extractor_version:"supplier_quote_v1"};
    const {data:runId,error:saveError}=await supabase.rpc("ln_save_supplier_quote_extraction_run",{p_quote_id:quoteId,p_source_file_name:file.name,p_parser:parsed.parser,p_quality:quality,p_parser_metadata:metadata,p_rows:mapped});
    if (saveError) throw saveError;
    return NextResponse.json({ok:true,run_id:runId,parser:parsed.parser,quality,rows:mapped.length,matched:mapped.filter(r=>r.matched_sourcing_id).length,proposals:mapped,metadata});
  } catch (error) {
    console.error("supplier quote extraction failed",error);
    return NextResponse.json({error:error instanceof Error?error.message:"Unable to extract supplier quote."},{status:500});
  }
}
