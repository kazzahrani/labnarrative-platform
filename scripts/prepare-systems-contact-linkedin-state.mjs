import fs from "node:fs";

const path = "app/admin/SystemsSimpleOutreachPanel.tsx";
let source = fs.readFileSync(path, "utf8");

const replaceAllLiteral = (from, to) => {
  if (source.includes(from)) source = source.split(from).join(to);
};

replaceAllLiteral(
  '  linkedin_note_ar: string | null;\n  linkedin_request_sent_at: string | null;\n};',
  '  linkedin_note_ar: string | null;\n  linkedin_request_sent_at: string | null;\n  linkedin_connected_at: string | null;\n  linkedin_followup: string | null;\n  linkedin_followup_ar: string | null;\n  linkedin_followup_sent_at: string | null;\n  linkedin_reply_at: string | null;\n};'
);

replaceAllLiteral(
  '.select("id,prospect_id,name,title,linkedin_url,email,priority,is_current_verified,linkedin_note,linkedin_note_ar,linkedin_request_sent_at")',
  '.select("id,prospect_id,name,title,linkedin_url,email,priority,is_current_verified,linkedin_note,linkedin_note_ar,linkedin_request_sent_at,linkedin_connected_at,linkedin_followup,linkedin_followup_ar,linkedin_followup_sent_at,linkedin_reply_at")'
);

replaceAllLiteral(
  '  const followupFor = (contact: Contact) => contact.id === selected.linkedin_recipient_contact_id ? (selected.linkedin_followup || "") : "";\n  const followupArFor = (contact: Contact) => contact.id === selected.linkedin_recipient_contact_id ? (selected.linkedin_followup_ar || "") : "";',
  '  const followupFor = (contact: Contact) => contact.linkedin_followup || (contact.id === selected.linkedin_recipient_contact_id ? (selected.linkedin_followup || "") : "");\n  const followupArFor = (contact: Contact) => contact.linkedin_followup_ar || (contact.id === selected.linkedin_recipient_contact_id ? (selected.linkedin_followup_ar || "") : "");'
);

replaceAllLiteral(
  '  const contactStatus = (contact: Contact) => {\n    const isPrimary = contact.id === selected.linkedin_recipient_contact_id;\n    if (isPrimary && selected.linkedin_reply_at) return "Replied";\n    if (isPrimary && selected.linkedin_followup_sent_at) return "Follow-up sent";\n    if (isPrimary && selected.linkedin_connected_at) return "Connected";\n    if (contact.linkedin_request_sent_at) return "Sent";',
  '  const contactStatus = (contact: Contact) => {\n    if (contact.linkedin_reply_at) return "Replied";\n    if (contact.linkedin_followup_sent_at) return "Follow-up sent";\n    if (contact.linkedin_connected_at) return "Connected";\n    if (contact.linkedin_request_sent_at) return "Sent";'
);

replaceAllLiteral(
  '    const isConnectedContact = contact.id === selected.linkedin_recipient_contact_id && Boolean(selected.linkedin_connected_at);',
  '    const isConnectedContact = Boolean(contact.linkedin_connected_at);'
);

replaceAllLiteral(
  '    if (selected.linkedin_connected_at && contact.id !== selected.linkedin_recipient_contact_id) {\n      setNotice(`A LinkedIn connection is already recorded for ${selected.company_name}.`);\n      return;\n    }\n',
  ''
);

replaceAllLiteral(
  '    if (!session || busyContact || !isConnectedContact || selected.linkedin_followup_sent_at) return;',
  '    if (!session || busyContact || !isConnectedContact || contact.linkedin_followup_sent_at) return;'
);

replaceAllLiteral(
  '    const { error } = await supabase.rpc("record_systems_linkedin_followup_sent", { p_prospect_id: selected.id });',
  '    const { error } = await supabase.rpc("record_systems_linkedin_followup_sent", { p_prospect_id: selected.id, p_contact_id: contact.id });'
);

replaceAllLiteral(
  '              const isPrimary = contact.id === selected.linkedin_recipient_contact_id;\n              const isConnectedContact = isPrimary && Boolean(selected.linkedin_connected_at);',
  '              const isConnectedContact = Boolean(contact.linkedin_connected_at);'
);

replaceAllLiteral(
  'disabled={busyContact === contact.id || isConnectedContact || Boolean(selected.linkedin_connected_at && !isConnectedContact)}',
  'disabled={busyContact === contact.id || isConnectedContact}'
);

replaceAllLiteral(
  'className={selected.linkedin_followup_sent_at ? styles.sentButton : styles.primaryButton}',
  'className={contact.linkedin_followup_sent_at ? styles.sentButton : styles.primaryButton}'
);

replaceAllLiteral(
  'disabled={busyContact === contact.id || Boolean(selected.linkedin_followup_sent_at) || (!selected.linkedin_followup && !selected.linkedin_followup_ar)}',
  'disabled={busyContact === contact.id || Boolean(contact.linkedin_followup_sent_at) || (!followupFor(contact) && !followupArFor(contact))}'
);

replaceAllLiteral(
  '{selected.linkedin_followup_sent_at ? "✓ Follow-up" : "Follow-up Sent"}',
  '{contact.linkedin_followup_sent_at ? "✓ Follow-up" : "Follow-up Sent"}'
);

fs.writeFileSync(path, source);
console.log("Prepared per-contact LinkedIn Connected / Follow-up state for Systems Acquisition.");
