import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PDFDocument, rgb, type PDFFont } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

export type HandoverEvidence={id:string;handover_id:string;created_at:string;snapshot_sha256:string;template_version:string;snapshot:any};

// Bundled, licensed Unicode font; no runtime external font request or transliteration.
const regularBytes=()=>readFileSync(join(process.cwd(),"node_modules/dejavu-fonts-ttf/ttf/DejaVuSans.ttf"));
const boldBytes=()=>readFileSync(join(process.cwd(),"node_modules/dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf"));

export async function renderHandoverPDF(evidence:HandoverEvidence){
  if(evidence.template_version!=="handover-v1")throw new Error("Unsupported evidence template version");
  const doc=await PDFDocument.create();doc.registerFontkit(fontkit);
  const [regular,bold]=await Promise.all([doc.embedFont(regularBytes(),{subset:true}),doc.embedFont(boldBytes(),{subset:true})]);
  const stamp=new Date(evidence.created_at);
  doc.setTitle("PVOS QPPV handover "+evidence.handover_id);doc.setAuthor("PVOS");
  doc.setSubject("Account-attributed Deputy acknowledgement and frozen workload evidence");
  doc.setCreationDate(stamp);doc.setModificationDate(stamp);
  const W=595.28,H=841.89,M=44,width=W-2*M;
  let page=doc.addPage([W,H]),y=H-M;
  function newPage(){page=doc.addPage([W,H]);y=H-M;}
  // Shape RTL spans separately: a Latin label must not force an Arabic name into Latin layout.
  const runs=(value:string)=>value.split(/([\p{Script=Arabic}\p{Script=Hebrew}\p{Mark}]+(?:[ \t]+[\p{Script=Arabic}\p{Script=Hebrew}\p{Mark}]+)*)/u).filter(Boolean);
  const measured=(value:string,font:PDFFont,size:number)=>runs(value).reduce((n,run)=>n+font.widthOfTextAtSize(run,size),0);
  const characters=new Set(regular.getCharacterSet().filter(c=>bold.getCharacterSet().includes(c)));
  function line(text:string,font:PDFFont,size:number,color=rgb(.13,.18,.23)){
    if(y<72)newPage();
    let x=M;
    for(const run of runs(text)){page.drawText(run,{x,y:y-size,font,size,color});x+=font.widthOfTextAtSize(run,size);}
    y-=size+5;
  }
  function wrapped(value:unknown,size=9.5,strong=false){
    const font=strong?bold:regular;
    const raw=String(value??"Not recorded").replace(/[\u0000-\u0008\u000B-\u001F]/g," ");
    for(const char of raw.replace(/[\r\n\t]/g,""))if(!characters.has(char.codePointAt(0)!))throw new Error("The bundled PDF font cannot render a character in this snapshot; evidence remains preserved.");
    const output:string[]=[];
    for(const paragraph of raw.split(/\r?\n/)){
      let row="";
      // Character-aware wrapping preserves long identifiers, emails and Unicode names.
      for(const word of paragraph.split(/\s+/)){
        const candidate=row?row+" "+word:word;
        if(measured(candidate,font,size)<=width){row=candidate;continue;}
        if(row){output.push(row);row="";}
        for(const char of word){
          if(row&&measured(row+char,font,size)>width){output.push(row);row="";}
          row+=char;
        }
      }
      output.push(row);
    }
    return output;
  }
  function text(value:unknown,size=9.5,strong=false){
    for(const row of wrapped(value,size,strong))line(row,strong?bold:regular,size);
  }
  function section(title:string){if(y<130)newPage();y-=12;text(title,12,true);y-=4;}
  function timestamp(v:unknown){return v?new Date(String(v)).toISOString():"Not recorded";}
  const s=evidence.snapshot;
  text("PVOS | QPPV continuity evidence",18,true);
  text("Deputy-acknowledged handover",13,true);y-=8;
  text("Workspace: "+s.participants.organization_name);
  text("Handover ID: "+s.handover_id);
  text("Evidence ID: "+evidence.id);
  text("Leave: "+s.leave_start+" to "+s.leave_end+" (inclusive)");
  text("Snapshot sent: "+timestamp(s.sent_at));
  text("All companies acknowledged: "+timestamp(s.accepted_at));
  section("Account attribution");
  text("Originating QPPV: "+s.participants.qppv.email,10,true);
  text("QPPV account ID: "+s.participants.qppv.user_id,8.5);
  text("Assigned Deputy QPPV: "+s.participants.deputy.email,10,true);
  text("Deputy account ID: "+s.participants.deputy.user_id,8.5);
  text("Acknowledgement is attributed to the authenticated assigned account. This document is not a qualified electronic signature or proof of professional appointment.",8.5);
  for(const [index,c] of s.companies.entries()){
    const snap=c.snapshot;
    section((index+1)+". "+snap.company_name);
    text("Company ID: "+c.company_id,8);
    if(snap.contract_scope)text("Contract scope: "+snap.contract_scope);
    text("Risk at snapshot: "+snap.risk+" | Open tasks: "+snap.open_tasks+" | Due during leave: "+snap.due_during_leave,9.5,true);
    text("Deputy acknowledged: "+timestamp(c.deputy_acknowledged_at));
    text("Acknowledging account: "+c.deputy_acknowledged_by,8.5);
    text("Deadline interpretation: Asia/Riyadh; timestamps below are UTC.",8);
    for(const [i,t] of snap.tasks.entries()){
      const block:[string,number,boolean][]=[[(i+1)+") "+t.title,10,true],
        ["Type: "+t.activity_type+" | Priority: "+t.priority+" | Status: "+t.status,9.5,false],
        ["Due at snapshot: "+(t.due_at?timestamp(t.due_at):"No deadline recorded"),9.5,false],
        ["Task ID: "+t.id,8,false]];
      const blockHeight=7+block.reduce((height,[value,size,strong])=>height+wrapped(value,size,strong).length*(size+5),0);
      if(y-blockHeight<72&&blockHeight<H-M-72)newPage();y-=7;
      for(const [value,size,strong] of block)text(value,size,strong);
    }
  }
  if(y<190)newPage();
  section("Traceability");
  text("Evidence frozen: "+timestamp(evidence.created_at));
  text("Template: "+evidence.template_version);
  text("Canonical database snapshot SHA-256:",8.5,true);text(evidence.snapshot_sha256,8);
  text("This PDF is rendered from the immutable acknowledgement snapshot, not the current task list. Later leave status and handback are separate audit events; this is not a final handback certificate.",8.5);
  const pages=doc.getPages();
  pages.forEach((p,i)=>{
    p.drawLine({start:{x:M,y:50},end:{x:W-M,y:50},thickness:.5,color:rgb(.75,.8,.83)});
    p.drawText("PVOS | "+evidence.handover_id.slice(0,8)+" | Page "+(i+1)+" / "+pages.length,{x:M,y:35,size:8,font:regular,color:rgb(.35,.4,.45)});
  });
  return doc.save();
}
