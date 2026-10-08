import * as XLSX from "xlsx";

export type EurdRow={
  substance:string;
  dlp:string;
  due:string;
  frequency:string;
  raw:Record<string,string>;
};
export type EurdColumns={substance:number;dlp:number;due:number;frequency:number};
export type EurdSheet={
  name:string;
  grid:unknown[][];
  headerRow:number;
  headers:string[];
  columns:EurdColumns;
  score:number;
};
export type EurdImport={sheets:EurdSheet[];rows:EurdRow[];bestSheet:number;diagnostics:string[]};

const clean=(v:unknown)=>String(v??"").toLowerCase().replace(/[\r\n]+/g," ").replace(/[^a-z0-9]+/g," ").trim();
const label=(v:unknown)=>String(v??"").replace(/\s+/g," ").trim();

export function validDate(y:number,m:number,d:number){
  if(!Number.isInteger(y)||!Number.isInteger(m)||!Number.isInteger(d)||y<1950||y>2150)return "";
  const dt=new Date(Date.UTC(y,m-1,d));
  if(dt.getUTCFullYear()!==y||dt.getUTCMonth()!==m-1||dt.getUTCDate()!==d)return "";
  return [String(y).padStart(4,"0"),String(m).padStart(2,"0"),String(d).padStart(2,"0")].join("-");
}
export function eurdDate(value:unknown):string{
  if(value instanceof Date){
    if(Number.isNaN(value.getTime()))return "";
    return validDate(value.getUTCFullYear(),value.getUTCMonth()+1,value.getUTCDate());
  }
  if(typeof value==="number"&&value>16000&&value<95000){
    const d=XLSX.SSF.parse_date_code(value);
    return d?validDate(d.y,d.m,d.d):"";
  }
  const raw=label(value);
  let m=raw.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})(?:\s.*)?$/);
  if(m)return validDate(+m[1],+m[2],+m[3]);
  // EURD uses European day/month/year ordering (not US month/day).
  m=raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if(m)return validDate(+m[3],+m[2],+m[1]);
  m=raw.match(/^(\d{1,2})[\s-]+([A-Za-z]{3,9})[\s-]+(\d{4})$/);
  if(m){
    const month=["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"].indexOf(m[2].slice(0,3).toLowerCase())+1;
    return month?validDate(+m[3],month,+m[1]):"";
  }
  return "";
}
export function eurdFrequencyMonths(value:string):number|null{
  const s=clean(value);
  if(!s||/as required|ad hoc|no routine|not required|not applicable/.test(s))return null;
  if(/\b(?:semi annual|half yearly|six monthly|twice yearly)\b/.test(s))return 6;
  if(/\bquarterly\b/.test(s))return 3;
  if(/\b(?:yearly|annually|annual)\b/.test(s))return 12;
  const m=s.match(/\b(\d+)\s*(?:month|months|year|years)\b/);
  if(!m)return null;
  const units=/\b(?:year|years)\b/.test(s.slice(m.index))?12:1;
  const result=+m[1]*units;
  return [1,3,6,12,24,36,48,60].includes(result)?result:null;
}

function guessColumns(headers:string[]):EurdColumns{
  const h=headers.map(clean);
  const index=(p:(label:string)=>boolean)=>h.findIndex(p);
  return {
    substance:index(s=>/\bactive substances?\b/.test(s)||/\bsubstances? (?:and )?combinations?\b/.test(s)||s==="inn"||s==="active ingredient"),
    dlp:index(s=>(/\bdlp\b|\bdata lock point\b/.test(s))&&!/\bnext\b/.test(s)),
    due:index(s=>(/\bsubmission date\b|\bdate of submission\b|\bsubmission deadline\b/.test(s))&&!/\bnext\b/.test(s)),
    frequency:index(s=>/\bsubmission frequency\b|\bfrequency\b|\bperiodicity\b/.test(s))
  };
}
function columnScore(c:EurdColumns){return (c.substance>=0?3:0)+(c.dlp>=0?2:0)+(c.due>=0?2:0)+(c.frequency>=0?1:0);}
function columnsForRow(row:unknown[],next:unknown[]=[]){
  const length=Math.max(row.length,next.length);
  return Array.from({length},(_,i)=>[label(row[i]),label(next[i])].filter(Boolean).join(" ").trim());
}
function detectSheet(name:string,grid:unknown[][]):EurdSheet{
  const limit=Math.min(grid.length,250);
  let best:EurdSheet={name,grid,headerRow:0,headers:[],columns:{substance:-1,dlp:-1,due:-1,frequency:-1},score:-1};
  for(let i=0;i<limit;i++){
    // EMA has multiline, merged and sometimes split column headings.
    const variants=[columnsForRow(grid[i]||[]),columnsForRow(grid[i]||[],grid[i+1]||[])];
    for(const headers of variants){
      const columns=guessColumns(headers);
      const score=columnScore(columns);
      if(score>best.score)best={name,grid,headerRow:i,headers,columns,score};
    }
  }
  if(best.score>=5)return best;
  // Recovery fallback: a plausible wide header row for manual mapping.
  const fallback=grid.slice(0,Math.min(grid.length,120))
    .map((r,i)=>({i,filled:(r||[]).filter(x=>label(x).length>2).length}))
    .sort((a,b)=>b.filled-a.filled)[0];
  const headerRow=fallback?.i??0;
  if(best.score<2)return {name,grid,headerRow,headers:columnsForRow(grid[headerRow]||[]),columns:guessColumns(columnsForRow(grid[headerRow]||[])),score:best.score};
  return best;
}
export function parseEurdRows(sheet:EurdSheet,columns:EurdColumns=sheet.columns,headerRow=sheet.headerRow):EurdRow[]{
  const {substance,dlp,due,frequency}=columns;
  if([substance,dlp,due].some(c=>c<0)||new Set([substance,dlp,due]).size!==3)return [];
  const rows:EurdRow[]=[];
  for(let i=headerRow+1;i<sheet.grid.length;i++){
    const row=sheet.grid[i]||[];
    const ingredient=label(row[substance]);
    const lock=eurdDate(row[dlp]),deadline=eurdDate(row[due]);
    if(!ingredient||!lock||!deadline||deadline<lock||ingredient.length>350)continue;
    const raw:Record<string,string>={"Source worksheet":sheet.name,"Source Excel row":String(i+1)};
    const headings=sheet.headers.length?sheet.headers:columnsForRow(sheet.grid[headerRow]||[]);
    row.forEach((v,j)=>{
      const text=label(v);
      if(text)raw[(headings[j]||XLSX.utils.encode_col(j)).slice(0,200)]=text.slice(0,2000);
    });
    rows.push({substance:ingredient,dlp:lock,due:deadline,frequency:label(row[frequency]),raw});
  }
  return rows;
}
export function readEurdFile(data:ArrayBuffer):EurdImport{
  const book=XLSX.read(data,{type:"array",cellDates:true});
  const sheets:EurdSheet[]=book.SheetNames.map(name=>{
    const grid=XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[name],{header:1,raw:true,blankrows:true,defval:""});
    return detectSheet(name,grid);
  });
  const candidates=sheets.map((sheet,i)=>({index:i,rows:parseEurdRows(sheet)}));
  candidates.sort((a,b)=>b.rows.length-a.rows.length||sheets[b.index].score-sheets[a.index].score);
  const best=candidates[0];
  return {
    sheets,bestSheet:best?.index??0,rows:best?.rows||[],
    diagnostics:sheets.map(s=>s.name+": "+s.grid.length+" rows; auto-detected "+["substance","dlp","due","frequency"].filter(key=>s.columns[key as keyof EurdColumns]>=0).join(", "))
  };
}
