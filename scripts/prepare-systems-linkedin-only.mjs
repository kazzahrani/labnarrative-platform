import fs from "node:fs";

function replaceIfPresent(source, from, to) {
  return source.includes(from) ? source.replace(from, to) : source;
}

// 1) Acquisition queue: remove active email presentation and make reply metrics LinkedIn-native.
const outreachPath = "app/admin/systems-outreach/page.tsx";
let outreach = fs.readFileSync(outreachPath, "utf8");

outreach = replaceIfPresent(
  outreach,
  'const metrics=useMemo(()=>({total:prospects.length,ready:prospects.filter((p)=>p.status==="ready_to_send").length,interested:prospects.filter((p)=>p.status==="interested").length,contacted:prospects.filter((p)=>["contacted","connected","replied","interested","meeting","proposal","won"].includes(p.status)).length,humanReplies:replies.filter((r)=>r.reply_kind==="human").length}),[prospects,replies]);',
  'const metrics=useMemo(()=>({total:prospects.length,ready:prospects.filter((p)=>p.status==="ready_to_send").length,interested:prospects.filter((p)=>p.status==="interested").length,contacted:prospects.filter((p)=>["contacted","connected","replied","interested","meeting","proposal","won"].includes(p.status)).length,humanReplies:prospects.filter((p)=>Boolean(p.linkedin_reply_at)).length}),[prospects]);'
);

outreach = outreach.replaceAll('<small>Across channels</small>', '<small>LinkedIn outreach</small>');
outreach = outreach.replaceAll('<small>Email replies</small>', '<small>LinkedIn replies</small>');

outreach = replaceIfPresent(
  outreach,
  '<thead><tr><th>Company</th><th>Fit</th><th>LinkedIn status</th><th>Email</th><th>Researched</th></tr></thead>',
  '<thead><tr><th>Company</th><th>Fit</th><th>LinkedIn status</th><th>Researched</th></tr></thead>'
);

outreach = replaceIfPresent(
  outreach,
  '<td><span className={styles.status}>{linkedinStatusLabel(p)}</span></td><td>{last?<span className={styles.mailMini}>{deliveryLabel(last)}</span>:p.email_draft_approved_at?<span className={styles.approvedMini}>Approved</span>:<span className={styles.muted}>Draft</span>}</td><td>{dateLabel(p.last_researched_at)}</td>',
  '<td><span className={styles.status}>{linkedinStatusLabel(p)}</span></td><td>{dateLabel(p.last_researched_at)}</td>'
);

outreach = outreach.replaceAll(
  'Research and drafts are prepared automatically; outreach remains human-approved.',
  'Research and LinkedIn outreach are prepared automatically; sending remains a human gate.'
);

fs.writeFileSync(outreachPath, outreach);

// 2) Selected-company panel: remove email recipient row and email-driven follow-up counters.
const simplePath = "app/admin/SystemsSimpleOutreachPanel.tsx";
let simple = fs.readFileSync(simplePath, "utf8");

simple = replaceIfPresent(
  simple,
  '  const linkedinSent = linkedinContacts.filter((contact) => Boolean(contact.linkedin_request_sent_at)).length;',
  '  const linkedinSent = linkedinContacts.filter((contact) => Boolean(contact.linkedin_request_sent_at)).length;\n  const linkedinConnected = linkedinContacts.filter((contact) => Boolean(contact.linkedin_connected_at)).length;'
);

simple = replaceIfPresent(simple, '  const outreachTotal = linkedinContacts.length + 1;', '  const outreachTotal = linkedinContacts.length;');
simple = replaceIfPresent(simple, '  const outreachReady = linkedinReady + emailReady;', '  const outreachReady = linkedinReady;');
simple = replaceIfPresent(simple, '  const outreachSent = linkedinSent + emailSent;', '  const outreachSent = linkedinSent;');

simple = replaceIfPresent(
  simple,
  '      <div className={styles.stats}>\n        <div><span>Outreach ready</span><strong>{outreachReady}/{outreachTotal}</strong></div>\n        <div><span>Sent</span><strong>{outreachSent}/{outreachTotal}</strong></div>\n        <div><span>LinkedIn</span><strong>{linkedinSent}/{linkedinContacts.length || 0}</strong></div>\n        <div><span>Active follow-ups</span><strong>{scheduledFollowups.length}</strong></div>\n        <div><span>Next follow-up</span><strong className={styles.dateValue}>{dateLabel(nextFollowup?.scheduled_for)}</strong></div>\n      </div>',
  '      <div className={styles.stats} style={{gridTemplateColumns:"repeat(3,minmax(0,1fr))"}}>\n        <div><span>LinkedIn ready</span><strong>{outreachReady}/{outreachTotal}</strong></div>\n        <div><span>Requests sent</span><strong>{outreachSent}/{outreachTotal}</strong></div>\n        <div><span>Connected</span><strong>{linkedinConnected}/{linkedinContacts.length || 0}</strong></div>\n      </div>'
);

const emailRow = `            <tr>\n              <td><strong>{recipientName}</strong><small>{recipientEmail}</small></td>\n              <td>Email</td>\n              <td><span className={\`${'${styles.rowStatus} ${statusTone(emailStatus)}'}\`}><span />{emailStatus}</span></td>\n              <td>\n                <div className={styles.rowActions}>\n                  <button type="button" onClick={() => void copyText(\`${'${selected.email_subject || ""}'}\\n\\n${'${selected.email_body || ""}'}\`.trim(), "Email copied.")} disabled={!selected.email_subject && !selected.email_body}>Copy</button>\n                  <button type="button" onClick={() => clickLegacyAction("Email")}>Open Email</button>\n                  <button className={emailSent ? styles.sentButton : styles.primaryButton} type="button" onClick={() => clickLegacyAction("Email")}>{emailSent ? "✓ Sent" : "Review & Send"}</button>\n                </div>\n              </td>\n            </tr>\n`;
simple = replaceIfPresent(simple, emailRow, '');

fs.writeFileSync(simplePath, simple);

// 3) Contact finder: do not surface stored email addresses in the active LinkedIn workflow.
const searchPath = "app/admin/SystemsContactSearchEnhancer.tsx";
let search = fs.readFileSync(searchPath, "utf8");
search = replaceIfPresent(search, '            {result.email ? <span>{result.email}</span> : null}\n', '');
fs.writeFileSync(searchPath, search);

console.log("Prepared LinkedIn-only LabNarrative Systems acquisition UI; historical email data remains stored but inactive.");
