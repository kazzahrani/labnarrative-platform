import fs from "node:fs";

function replaceOnce(source, from, to, label) {
  if (source.includes(to)) return source;
  if (!source.includes(from)) throw new Error(`prepare-systems-unified-actions: pattern not found for ${label}`);
  return source.replace(from, to);
}

const homePath = "app/admin/systems/page.tsx";
let home = fs.readFileSync(homePath, "utf8");

home = replaceOnce(
  home,
  'contact: asString(sprint.primaryContact || sprint.contactName || sprint.contact_name),',
  'contact: asString(sprint.primaryContactName || sprint.primaryContact || sprint.contactName || sprint.contact_name),',
  "sprint contact name"
);

home = replaceOnce(
  home,
  'function prospectHref(base: string, prospect: Prospect) {\n  if (base === "/admin/systems-outreach") return base;\n  return `${base}?prospect=${encodeURIComponent(prospect.id)}`;\n}',
  'function prospectHref(base: string, prospect: Prospect) {\n  return `${base}?prospect=${encodeURIComponent(prospect.id)}`;\n}',
  "prospect-aware module links"
);

home = replaceOnce(
  home,
  '{modules.slice(0, 6).map((module, index) => <div key={module.key} className={styles.flowItem}><span>{module.n}</span><b>{module.title}</b>{index < 5 ? <i>→</i> : null}</div>)}',
  '{modules.slice(0, 6).map((module, index) => <Link key={module.key} href={selected ? prospectHref(module.href, selected) : module.href} className={styles.flowItem} style={{textDecoration:"none"}}><span>{module.n}</span><b>{module.title}</b>{index < 5 ? <i>→</i> : null}</Link>)}',
  "clickable lifecycle flow"
);

home = replaceOnce(
  home,
  '        <div className={styles.companyHead}><div><p>{selected.industry || "Systems prospect"}</p><h2>{selected.company_name}</h2><span>{[selected.city, selected.country].filter(Boolean).join(" · ")}</span></div><div className={styles.stageBadge}><span>Current stage</span><strong>{selectedStage.label}</strong><small>Updated {dateLabel(selected.updated_at)}</small></div></div>\n\n        <div className={styles.nextAction}>',
  '        <div className={styles.companyHead}><div><p>{selected.industry || "Systems prospect"}</p><h2>{selected.company_name}</h2><span>{[selected.city, selected.country].filter(Boolean).join(" · ")}</span></div><div className={styles.stageBadge}><span>Current stage</span><strong>{selectedStage.label}</strong><small>Updated {dateLabel(selected.updated_at)}</small></div></div>\n\n        <div style={{display:"flex",flexWrap:"wrap",gap:8,marginTop:14}}>\n          <Link href={prospectHref("/admin/systems-outreach", selected)} style={{display:"inline-flex",alignItems:"center",borderRadius:10,padding:"10px 13px",background:"#aee94e",color:"#07161e",textDecoration:"none",fontSize:11,fontWeight:900}}>Open Acquisition →</Link>\n          {selected.demo_status === "ready" ? <a href={`/systems/demos/${selected.slug}`} target="_blank" rel="noreferrer" style={{display:"inline-flex",alignItems:"center",borderRadius:10,padding:"10px 13px",background:"#35c7c1",color:"#07161e",textDecoration:"none",fontSize:11,fontWeight:900}}>Open Demo ↗</a> : <span style={{display:"inline-flex",alignItems:"center",borderRadius:10,padding:"10px 13px",border:"1px solid #294854",color:"#819aa3",fontSize:11,fontWeight:800}}>Demo not ready</span>}\n        </div>\n\n        <div className={styles.nextAction}>',
  "prominent acquisition/demo actions"
);

fs.writeFileSync(homePath, home);

const outreachPath = "app/admin/systems-outreach/page.tsx";
let outreach = fs.readFileSync(outreachPath, "utf8");

outreach = replaceOnce(
  outreach,
  '    const next=(p.data??[]) as Prospect[];setProspects(next);setContacts((c.data??[]) as Contact[]);setMessages((m.data??[]) as MailMessage[]);setReplies((r.data??[]) as Reply[]);\n    setSelectedId((current)=>current&&next.some((x)=>x.id===current)?current:(next.find((x)=>x.status==="ready_to_send")?.id??next[0]?.id??null));setLoading(false);',
  '    const next=(p.data??[]) as Prospect[];setProspects(next);setContacts((c.data??[]) as Contact[]);setMessages((m.data??[]) as MailMessage[]);setReplies((r.data??[]) as Reply[]);\n    const requested=typeof window!=="undefined"?new URLSearchParams(window.location.search).get("prospect"):null;\n    setSelectedId((current)=>{if(requested&&next.some((x)=>x.id===requested))return requested;return current&&next.some((x)=>x.id===current)?current:(next.find((x)=>x.status==="ready_to_send")?.id??next[0]?.id??null)});setLoading(false);',
  "acquisition prospect query selection"
);

fs.writeFileSync(outreachPath, outreach);
console.log("Prepared unified Systems actions and prospect-aware Acquisition navigation.");
