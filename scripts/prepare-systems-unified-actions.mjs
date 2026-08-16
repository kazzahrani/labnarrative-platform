import fs from "node:fs";

function replaceOnce(source, from, to, label) {
  if (source.includes(to)) return source;
  if (!source.includes(from)) throw new Error(`prepare-systems-unified-actions: pattern not found for ${label}`);
  return source.replace(from, to);
}

function replaceIfPresent(source, from, to) {
  return source.includes(from) ? source.replace(from, to) : source;
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
  '{ key: "acquisition", n: "01", title: "Acquisition", text: "Prospects, contacts, LinkedIn, email and the human send gate.", href: "/admin/systems-outreach" },',
  '{ key: "acquisition", n: "01", title: "Acquisition", text: "Prospects, contacts, LinkedIn, email and the human send gate.", href: "/admin/systems/acquire" },',
  "unified acquisition module route"
);

home = replaceOnce(
  home,
  'return { label: prospect.status === "ready_to_send" ? "Teaser Ready" : "Acquisition", detail: prospect.status.replaceAll("_", " "), href: "/admin/systems-outreach", action: "Open Acquisition", order: 1 };',
  'return { label: prospect.status === "ready_to_send" ? "Teaser Ready" : "Acquisition", detail: prospect.status.replaceAll("_", " "), href: "/admin/systems/acquire", action: "Open Acquisition", order: 1 };',
  "unified acquisition stage route"
);

home = replaceOnce(
  home,
  'function prospectHref(base: string, prospect: Prospect) {\n  if (base === "/admin/systems-outreach") return base;\n  return `${base}?prospect=${encodeURIComponent(prospect.id)}`;\n}',
  'function prospectHref(base: string, prospect: Prospect) {\n  return `${base}?prospect=${encodeURIComponent(prospect.id)}`;\n}',
  "prospect-aware module links"
);

home = replaceOnce(
  home,
  '    setSelectedId((current) => current && next.some((item) => item.id === current) ? current : (next.find((item) => item.status === "interested")?.id ?? next.find((item) => item.status === "ready_to_send")?.id ?? next[0]?.id ?? ""));',
  '    const requested = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("prospect") : null;\n    setSelectedId((current) => { if (requested && next.some((item) => item.id === requested)) return requested; return current && next.some((item) => item.id === current) ? current : (next.find((item) => item.status === "interested")?.id ?? next.find((item) => item.status === "ready_to_send")?.id ?? next[0]?.id ?? ""); });',
  "home prospect query selection"
);

home = replaceOnce(
  home,
  '<div className={styles.heroActions}><Link href="/admin/systems-outreach" className={styles.primary}>Open Acquisition</Link><button onClick={() => session && void load(session)} disabled={loading}>{loading ? "Refreshing…" : "Refresh platform"}</button></div>',
  '<div className={styles.heroActions}><a href="/admin/systems/acquire" className={styles.primary}>Open Acquisition</a><button onClick={() => session && void load(session)} disabled={loading}>{loading ? "Refreshing…" : "Refresh platform"}</button></div>',
  "native hero acquisition link"
);

home = replaceOnce(
  home,
  '{modules.slice(0, 6).map((module, index) => <div key={module.key} className={styles.flowItem}><span>{module.n}</span><b>{module.title}</b>{index < 5 ? <i>→</i> : null}</div>)}',
  '{modules.slice(0, 6).map((module, index) => <a key={module.key} href={selected ? prospectHref(module.href, selected) : module.href} className={styles.flowItem} style={{textDecoration:"none",color:"inherit"}}><span>{module.n}</span><b>{module.title}</b>{index < 5 ? <i>→</i> : null}</a>)}',
  "native clickable lifecycle flow"
);

home = replaceOnce(
  home,
  '        <div className={styles.companyHead}><div><p>{selected.industry || "Systems prospect"}</p><h2>{selected.company_name}</h2><span>{[selected.city, selected.country].filter(Boolean).join(" · ")}</span></div><div className={styles.stageBadge}><span>Current stage</span><strong>{selectedStage.label}</strong><small>Updated {dateLabel(selected.updated_at)}</small></div></div>\n\n        <div className={styles.nextAction}>',
  '        <div className={styles.companyHead}><div><p>{selected.industry || "Systems prospect"}</p><h2>{selected.company_name}</h2><span>{[selected.city, selected.country].filter(Boolean).join(" · ")}</span></div><div className={styles.stageBadge}><span>Current stage</span><strong>{selectedStage.label}</strong><small>Updated {dateLabel(selected.updated_at)}</small></div></div>\n\n        <div style={{display:"flex",flexWrap:"wrap",gap:8,marginTop:14,position:"relative",zIndex:5,pointerEvents:"auto"}}>\n          <a href={prospectHref("/admin/systems/acquire", selected)} style={{display:"inline-flex",alignItems:"center",borderRadius:10,padding:"10px 13px",background:"#aee94e",color:"#07161e",textDecoration:"none",fontSize:11,fontWeight:900}}>Open Acquisition →</a>\n          {selected.demo_status === "ready" ? <a href={`/systems/demos/${selected.slug}`} target="_blank" rel="noreferrer" style={{display:"inline-flex",alignItems:"center",borderRadius:10,padding:"10px 13px",background:"#35c7c1",color:"#07161e",textDecoration:"none",fontSize:11,fontWeight:900}}>Open Demo ↗</a> : <span style={{display:"inline-flex",alignItems:"center",borderRadius:10,padding:"10px 13px",border:"1px solid #294854",color:"#819aa3",fontSize:11,fontWeight:800}}>Demo not ready</span>}\n        </div>\n\n        <div className={styles.nextAction}>',
  "prominent native acquisition/demo actions"
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

const routePatches = [
  ["app/admin/SystemsSimpleOutreachPanel.tsx", 'const validPaths = new Set(["/admin/systems", "/admin/systems-outreach"]);', 'const validPaths = new Set(["/admin/systems", "/admin/systems/acquire", "/admin/systems-outreach"]);'],
  ["app/admin/SystemsContactSearchEnhancer.tsx", 'const validPaths = new Set(["/admin/systems", "/admin/systems-outreach"]);', 'const validPaths = new Set(["/admin/systems", "/admin/systems/acquire", "/admin/systems-outreach"]);'],
  ["app/admin/SystemsConnectedFilterEnhancer.tsx", 'const SYSTEMS_PATHS = new Set(["/admin/systems", "/admin/systems-outreach"]);', 'const SYSTEMS_PATHS = new Set(["/admin/systems", "/admin/systems/acquire", "/admin/systems-outreach"]);'],
  ["app/admin/SystemsLinkedInBatchLauncher.tsx", 'const isSystemsRoute = pathname === "/admin/systems" || pathname === "/admin/systems-outreach";', 'const isSystemsRoute = pathname === "/admin/systems" || pathname === "/admin/systems/acquire" || pathname === "/admin/systems-outreach";'],
  ["app/admin/SystemsEmailBatchLauncher.tsx", 'const isSystemsRoute = pathname === "/admin/systems" || pathname === "/admin/systems-outreach";', 'const isSystemsRoute = pathname === "/admin/systems" || pathname === "/admin/systems/acquire" || pathname === "/admin/systems-outreach";'],
];

for (const [path, from, to] of routePatches) {
  let source = fs.readFileSync(path, "utf8");
  source = replaceIfPresent(source, from, to);
  fs.writeFileSync(path, source);
}

const simplePanelPath = "app/admin/SystemsSimpleOutreachPanel.tsx";
let simplePanel = fs.readFileSync(simplePanelPath, "utf8");

simplePanel = replaceIfPresent(
  simplePanel,
  '  linkedin_note: string | null;\n  linkedin_recipient_contact_id: string | null;',
  '  linkedin_note: string | null;\n  linkedin_note_ar: string | null;\n  linkedin_followup: string | null;\n  linkedin_followup_ar: string | null;\n  linkedin_recipient_contact_id: string | null;'
);

simplePanel = replaceIfPresent(
  simplePanel,
  '.select("id,company_name,slug,website_url,city,country,industry,fit_score,status,demo_status,linkedin_note,linkedin_recipient_contact_id,linkedin_connected_at,linkedin_followup_sent_at,linkedin_reply_at,email_subject,email_body,email_recipient_contact_id,email_recipient_email,email_draft_approved_at,email_sent_at,email_delivery_status,manual_email_recipient_email,manual_email_recipient_name,sequence_status")',
  '.select("id,company_name,slug,website_url,city,country,industry,fit_score,status,demo_status,linkedin_note,linkedin_note_ar,linkedin_followup,linkedin_followup_ar,linkedin_recipient_contact_id,linkedin_connected_at,linkedin_followup_sent_at,linkedin_reply_at,email_subject,email_body,email_recipient_contact_id,email_recipient_email,email_draft_approved_at,email_sent_at,email_delivery_status,manual_email_recipient_email,manual_email_recipient_name,sequence_status")'
);

simplePanel = replaceIfPresent(
  simplePanel,
  '  const noteFor = (contact: Contact) => contact.linkedin_note || (contact.id === selected.linkedin_recipient_contact_id ? selected.linkedin_note : null) || "";',
  '  const noteFor = (contact: Contact) => contact.linkedin_note || (contact.id === selected.linkedin_recipient_contact_id ? selected.linkedin_note : null) || "";\n  const noteArFor = (contact: Contact) => contact.linkedin_note_ar || (contact.id === selected.linkedin_recipient_contact_id ? selected.linkedin_note_ar : null) || "";\n  const followupFor = (contact: Contact) => contact.id === selected.linkedin_recipient_contact_id ? (selected.linkedin_followup || "") : "";\n  const followupArFor = (contact: Contact) => contact.id === selected.linkedin_recipient_contact_id ? (selected.linkedin_followup_ar || "") : "";'
);

simplePanel = replaceIfPresent(
  simplePanel,
  '    if (!session || busyContact || contact.linkedin_request_sent_at) {\n      if (contact.linkedin_request_sent_at) clickLegacyAction("LinkedIn");\n      return;\n    }',
  '    if (!session || busyContact || contact.linkedin_request_sent_at) return;'
);

simplePanel = replaceIfPresent(
  simplePanel,
  '  const companySubtitle = [selected.industry, selected.city, selected.country, `Fit ${selected.fit_score}/100`].filter(Boolean).join(" · ");',
  '  const markLinkedinConnected = async (contact: Contact) => {\n    if (!session || busyContact || !contact.linkedin_request_sent_at) return;\n    const isConnectedContact = contact.id === selected.linkedin_recipient_contact_id && Boolean(selected.linkedin_connected_at);\n    if (isConnectedContact) return;\n    if (selected.linkedin_connected_at && contact.id !== selected.linkedin_recipient_contact_id) {\n      setNotice(`A LinkedIn connection is already recorded for ${selected.company_name}.`);\n      return;\n    }\n\n    setBusyContact(contact.id);\n    setNotice("");\n    const { error } = await supabase.rpc("record_systems_linkedin_connected", {\n      p_prospect_id: selected.id,\n      p_contact_id: contact.id,\n    });\n\n    if (error) setNotice(error.message);\n    else {\n      setNotice(`${contact.name} marked as connected. EN/AR now copy the post-acceptance follow-up.`);\n      await load(session);\n    }\n    setBusyContact(null);\n  };\n\n  const markLinkedinFollowupSent = async (contact: Contact) => {\n    const isConnectedContact = contact.id === selected.linkedin_recipient_contact_id && Boolean(selected.linkedin_connected_at);\n    if (!session || busyContact || !isConnectedContact || selected.linkedin_followup_sent_at) return;\n\n    setBusyContact(contact.id);\n    setNotice("");\n    const { error } = await supabase.rpc("record_systems_linkedin_followup_sent", { p_prospect_id: selected.id });\n    if (error) setNotice(error.message);\n    else {\n      setNotice(`Post-acceptance LinkedIn follow-up to ${contact.name} recorded as sent.`);\n      await load(session);\n    }\n    setBusyContact(null);\n  };\n\n  const companySubtitle = [selected.industry, selected.city, selected.country, `Fit ${selected.fit_score}/100`].filter(Boolean).join(" · ");'
);

simplePanel = replaceIfPresent(
  simplePanel,
  '              const currentStatus = contactStatus(contact);\n              const note = noteFor(contact);',
  '              const currentStatus = contactStatus(contact);\n              const isPrimary = contact.id === selected.linkedin_recipient_contact_id;\n              const isConnectedContact = isPrimary && Boolean(selected.linkedin_connected_at);\n              const note = isConnectedContact ? followupFor(contact) : noteFor(contact);\n              const noteAr = isConnectedContact ? followupArFor(contact) : noteArFor(contact);'
);

simplePanel = replaceIfPresent(
  simplePanel,
  '                      <button type="button" onClick={() => void copyText(note, `${contact.name}\'s LinkedIn note copied.`)} disabled={!note}>Copy</button>',
  '                      <button type="button" onClick={() => void copyText(note, `${contact.name}\'s ${isConnectedContact ? "follow-up" : "LinkedIn note"} copied in English.`)} disabled={!note}>EN</button><button type="button" onClick={() => void copyText(noteAr, `${contact.name}\'s ${isConnectedContact ? "follow-up" : "LinkedIn note"} copied in Arabic.`)} disabled={!noteAr}>AR</button>'
);

simplePanel = replaceIfPresent(
  simplePanel,
  '                        disabled={busyContact === contact.id}\n                        title={contact.linkedin_request_sent_at ? "Open LinkedIn status workflow" : "Record this manual LinkedIn request as sent"}',
  '                        disabled={busyContact === contact.id || Boolean(contact.linkedin_request_sent_at)}\n                        title={contact.linkedin_request_sent_at ? "LinkedIn request recorded as sent" : "Record this manual LinkedIn request as sent"}'
);

simplePanel = replaceIfPresent(
  simplePanel,
  '                      >\n                        {busyContact === contact.id ? "Saving…" : contact.linkedin_request_sent_at ? "✓ Sent" : "Mark Sent"}\n                      </button>\n                    </div>',
  '                      >\n                        {busyContact === contact.id ? "Saving…" : contact.linkedin_request_sent_at ? "✓ Sent" : "Mark Sent"}\n                      </button>\n                      {contact.linkedin_request_sent_at ? <button className={isConnectedContact ? styles.sentButton : styles.primaryButton} type="button" onClick={() => void markLinkedinConnected(contact)} disabled={busyContact === contact.id || isConnectedContact || Boolean(selected.linkedin_connected_at && !isConnectedContact)} title={isConnectedContact ? "Connection accepted" : "Record that this LinkedIn contact accepted the connection request"}>{isConnectedContact ? "✓ Connected" : "Connected"}</button> : null}\n                      {isConnectedContact ? <button className={selected.linkedin_followup_sent_at ? styles.sentButton : styles.primaryButton} type="button" onClick={() => void markLinkedinFollowupSent(contact)} disabled={busyContact === contact.id || Boolean(selected.linkedin_followup_sent_at) || (!selected.linkedin_followup && !selected.linkedin_followup_ar)} title="Record the post-acceptance LinkedIn follow-up as sent">{selected.linkedin_followup_sent_at ? "✓ Follow-up" : "Follow-up Sent"}</button> : null}\n                    </div>'
);

simplePanel = replaceIfPresent(
  simplePanel,
  '          <button type="button" onClick={() => clickLegacyAction("LinkedIn")}>LinkedIn details</button>\n',
  ''
);

fs.writeFileSync(simplePanelPath, simplePanel);

console.log("Prepared unified Systems Home, inline LinkedIn EN/AR, Sent, Connected and Follow-up workflow.");