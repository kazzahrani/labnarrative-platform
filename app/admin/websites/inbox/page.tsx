"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { browserSupabase as supabase } from "@/lib/supabase-browser";

type Channel = "email" | "linkedin";
type Filter = "all" | Channel;

type EmailReply = {
  id: string;
  prospect_id: string;
  from_email: string;
  subject: string;
  body_text: string;
  received_at: string;
  reply_kind: string;
  classification_reason: string;
};

type LinkedInReply = {
  id: string;
  prospect_id: string | null;
  source_from_email: string;
  subject: string;
  sender_name: string;
  sender_profile_url: string;
  notification_type: "reply" | "notification" | "unknown";
  match_method: string;
  status: "new" | "handled" | "ignored";
  raw_payload: Record<string, unknown> | null;
  received_at: string;
};

type Prospect = {
  id: string;
  pi_name: string;
  institution: string;
  site_id: string | null;
};

type LinkedInOutreach = {
  prospect_id: string;
  profile_url: string;
  status: string;
};

type InboxItem = {
  key: string;
  channel: Channel;
  sourceId: string;
  prospectId: string | null;
  name: string;
  institution: string;
  subject: string;
  preview: string;
  receivedAt: string;
  state: string;
  profileUrl: string;
  unmatched: boolean;
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Riyadh",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

function linkedinSearch(name: string, institution: string) {
  return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent([name, institution].filter(Boolean).join(" "))}`;
}

function linkedinPreview(row: LinkedInReply) {
  const payload = row.raw_payload && typeof row.raw_payload === "object" ? row.raw_payload : {};
  const gmailBody = typeof payload.gmail_body_text === "string" ? payload.gmail_body_text.trim() : "";
  if (gmailBody) return gmailBody;
  if (row.notification_type === "unknown") {
    return "LinkedIn notification received. Review it on LinkedIn before treating it as a confirmed reply.";
  }
  return "LinkedIn reply detected from the notification email.";
}

export default function UnifiedInboxPage() {
  const [authState, setAuthState] = useState<"loading" | "signed_out" | "forbidden" | "ready">("loading");
  const [loading, setLoading] = useState(true);
  const [emailReplies, setEmailReplies] = useState<EmailReply[]>([]);
  const [linkedinReplies, setLinkedinReplies] = useState<LinkedInReply[]>([]);
  const [prospects, setProspects] = useState<Map<string, Prospect>>(new Map());
  const [linkedin, setLinkedin] = useState<Map<string, LinkedInOutreach>>(new Map());
  const [inboundDomain, setInboundDomain] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [acting, setActing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (!session) {
      setAuthState("signed_out");
      setLoading(false);
      return;
    }

    const { data: roleRow, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", session.user.id)
      .maybeSingle();
    if (roleError) {
      setError(roleError.message);
      setLoading(false);
      return;
    }
    if (roleRow?.role !== "admin") {
      setAuthState("forbidden");
      setLoading(false);
      return;
    }
    setAuthState("ready");

    const [emailResult, linkedinResult, integrationResult] = await Promise.all([
      supabase
        .from("outreach_replies")
        .select("id,prospect_id,from_email,subject,body_text,received_at,reply_kind,classification_reason")
        .eq("reply_kind", "human")
        .order("received_at", { ascending: false })
        .limit(120),
      supabase
        .from("linkedin_inbox_messages")
        .select("id,prospect_id,source_from_email,subject,sender_name,sender_profile_url,notification_type,match_method,status,raw_payload,received_at")
        .in("notification_type", ["reply", "unknown"])
        .neq("status", "ignored")
        .order("received_at", { ascending: false })
        .limit(120),
      supabase
        .from("resend_integration_state")
        .select("inbound_domain")
        .eq("id", "primary")
        .maybeSingle(),
    ]);

    const firstError = emailResult.error || linkedinResult.error;
    if (firstError) {
      setError(firstError.message);
      setLoading(false);
      return;
    }

    const emails = (emailResult.data || []) as EmailReply[];
    const linkedins = (linkedinResult.data || []) as LinkedInReply[];
    setEmailReplies(emails);
    setLinkedinReplies(linkedins);
    setInboundDomain(String(integrationResult.data?.inbound_domain || ""));

    const ids = Array.from(new Set([
      ...emails.map((row) => row.prospect_id),
      ...linkedins.map((row) => row.prospect_id).filter(Boolean),
    ] as string[]));

    if (!ids.length) {
      setProspects(new Map());
      setLinkedin(new Map());
      setLoading(false);
      return;
    }

    const [prospectResult, linkedinOutreachResult] = await Promise.all([
      supabase.from("prospects").select("id,pi_name,institution,site_id").in("id", ids),
      supabase.from("linkedin_outreach").select("prospect_id,profile_url,status").in("prospect_id", ids),
    ]);
    const secondError = prospectResult.error || linkedinOutreachResult.error;
    if (secondError) {
      setError(secondError.message);
      setLoading(false);
      return;
    }

    setProspects(new Map(((prospectResult.data || []) as Prospect[]).map((row) => [row.id, row])));
    setLinkedin(new Map(((linkedinOutreachResult.data || []) as LinkedInOutreach[]).map((row) => [row.prospect_id, row])));
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const channel = supabase
      .channel("unified-reply-inbox")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "outreach_replies" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "linkedin_inbox_messages" }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load]);

  const items = useMemo<InboxItem[]>(() => {
    const emailItems = emailReplies.map((row): InboxItem => {
      const prospect = prospects.get(row.prospect_id);
      return {
        key: `email-${row.id}`,
        channel: "email",
        sourceId: row.id,
        prospectId: row.prospect_id,
        name: prospect?.pi_name || row.from_email,
        institution: prospect?.institution || "",
        subject: row.subject || "Email reply",
        preview: row.body_text || row.from_email,
        receivedAt: row.received_at,
        state: "Human reply",
        profileUrl: linkedin.get(row.prospect_id)?.profile_url || "",
        unmatched: !prospect,
      };
    });

    const linkedinItems = linkedinReplies.map((row): InboxItem => {
      const prospect = row.prospect_id ? prospects.get(row.prospect_id) : undefined;
      const profile = row.prospect_id ? linkedin.get(row.prospect_id)?.profile_url : "";
      return {
        key: `linkedin-${row.id}`,
        channel: "linkedin",
        sourceId: row.id,
        prospectId: row.prospect_id,
        name: prospect?.pi_name || row.sender_name || "Unmatched LinkedIn reply",
        institution: prospect?.institution || "",
        subject: row.subject || "LinkedIn message notification",
        preview: linkedinPreview(row),
        receivedAt: row.received_at,
        state: row.status === "handled" ? "Handled" : row.notification_type === "reply" ? "New reply" : "Needs review",
        profileUrl: row.sender_profile_url || profile || "",
        unmatched: !row.prospect_id,
      };
    });

    return [...emailItems, ...linkedinItems].sort((a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt));
  }, [emailReplies, linkedinReplies, prospects, linkedin]);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) => {
      if (filter !== "all" && item.channel !== filter) return false;
      if (!query) return true;
      return [item.name, item.institution, item.subject, item.preview, item.channel].join(" ").toLowerCase().includes(query);
    });
  }, [filter, items, search]);

  const metrics = useMemo(() => ({
    total: items.length,
    email: items.filter((item) => item.channel === "email").length,
    linkedin: items.filter((item) => item.channel === "linkedin").length,
    unmatched: items.filter((item) => item.channel === "linkedin" && item.unmatched).length,
  }), [items]);

  async function markHandled(item: InboxItem) {
    if (item.channel !== "linkedin" || acting) return;
    setActing(item.sourceId);
    setNotice("");
    setError("");
    const { error: updateError } = await supabase
      .from("linkedin_inbox_messages")
      .update({ status: "handled", updated_at: new Date().toISOString() })
      .eq("id", item.sourceId);
    if (updateError) setError(updateError.message);
    else {
      setNotice(`${item.name} marked handled.`);
      await load();
    }
    setActing(null);
  }

  if (authState === "loading" || loading) {
    return <main className="ln-inbox-page"><section className="ln-inbox-auth">Preparing Unified Inbox…</section><Styles /></main>;
  }
  if (authState === "signed_out") {
    return <main className="ln-inbox-page"><section className="ln-inbox-auth"><h1>Administrator sign-in required.</h1><Link href="/admin">Open dashboard</Link></section><Styles /></main>;
  }
  if (authState === "forbidden") {
    return <main className="ln-inbox-page"><section className="ln-inbox-auth"><h1>Administrator permission required.</h1><Link href="/admin">Return to dashboard</Link></section><Styles /></main>;
  }

  const forwardingAddress = inboundDomain ? `linkedin@${inboundDomain}` : "LinkedIn inbound alias is being prepared";

  return <main className="ln-inbox-page">
    <header className="ln-inbox-header">
      <div>
        <p className="ln-inbox-kicker">LabNarrative sales communications</p>
        <h1>Unified Inbox</h1>
        <p>Email and LinkedIn replies in one operator workspace.</p>
      </div>
      <button onClick={() => void load()} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</button>
    </header>

    {notice ? <p className="ln-inbox-notice">{notice}</p> : null}
    {error ? <p className="ln-inbox-error">{error}</p> : null}

    <section className="ln-inbox-metrics">
      <article><span>Replies</span><strong>{metrics.total}</strong><small>Current unified feed</small></article>
      <article><span>Email</span><strong>{metrics.email}</strong><small>Human replies</small></article>
      <article><span>LinkedIn</span><strong>{metrics.linkedin}</strong><small>Reply candidates</small></article>
      <article><span>Needs matching</span><strong>{metrics.unmatched}</strong><small>Kept visible, never guessed</small></article>
    </section>

    <section className="ln-inbox-connection">
      <div>
        <p className="ln-inbox-kicker">LinkedIn connection</p>
        <h2>Notification forwarding address</h2>
        <p>Hourly Gmail sync is active. This dedicated address is also ready for near-real-time LinkedIn notification forwarding when you want to enable it.</p>
      </div>
      <code>{forwardingAddress}</code>
    </section>

    <section className="ln-inbox-card">
      <div className="ln-inbox-toolbar">
        <div className="ln-inbox-filters">
          {(["all", "email", "linkedin"] as Filter[]).map((value) => <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{value === "all" ? "All" : value === "email" ? "Email" : "LinkedIn"}</button>)}
        </div>
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search PI, institution or subject…" />
      </div>

      {!visible.length ? <div className="ln-inbox-empty"><h3>No replies in this view yet.</h3><p>New human email replies appear automatically. LinkedIn replies appear after LinkedIn messaging email notifications reach the connected Gmail account.</p></div> : <div className="ln-inbox-list">
        {visible.map((item) => {
          const prospect = item.prospectId ? prospects.get(item.prospectId) : undefined;
          const linkedinHref = item.profileUrl || linkedinSearch(item.name, item.institution);
          return <article className="ln-inbox-row" key={item.key}>
            <div className={`ln-inbox-channel ${item.channel}`}>{item.channel === "email" ? "Email" : "LinkedIn"}</div>
            <div className="ln-inbox-copy">
              <div className="ln-inbox-title"><strong>{item.name}</strong><span>{formatDate(item.receivedAt)}</span></div>
              {item.institution ? <small>{item.institution}</small> : null}
              <h3>{item.subject}</h3>
              <p>{item.preview.length > 900 ? `${item.preview.slice(0, 900)}…` : item.preview}</p>
              <div className="ln-inbox-state"><span className={item.unmatched ? "warn" : "ok"}>{item.unmatched ? "Unmatched" : "Matched prospect"}</span><span>{item.state}</span></div>
            </div>
            <div className="ln-inbox-actions">
              {item.prospectId ? <Link href={`/admin/sales/${item.prospectId}`}>Open prospect →</Link> : null}
              {item.channel === "linkedin" || prospect ? <a href={linkedinHref} target="_blank" rel="noreferrer">Open LinkedIn ↗</a> : null}
              {item.channel === "linkedin" && item.state !== "Handled" ? <button disabled={acting === item.sourceId} onClick={() => void markHandled(item)}>{acting === item.sourceId ? "Saving…" : "Mark handled"}</button> : null}
            </div>
          </article>;
        })}
      </div>}
    </section>
    <Styles />
  </main>;
}

function Styles() {
  return <style jsx global>{`
    .ln-inbox-page{min-height:100vh;background:#0c1a23;color:#eef4f1;padding:38px 24px 64px;font-family:Arial,Helvetica,sans-serif}.ln-inbox-header,.ln-inbox-metrics,.ln-inbox-connection,.ln-inbox-card,.ln-inbox-notice,.ln-inbox-error{width:min(1220px,100%);margin-left:auto;margin-right:auto}.ln-inbox-header{display:flex;justify-content:space-between;align-items:flex-start;gap:24px}.ln-inbox-kicker{margin:0 0 8px;color:#79c9b2;text-transform:uppercase;letter-spacing:.12em;font-size:.7rem;font-weight:900}.ln-inbox-header h1{font-size:2.45rem;margin:0}.ln-inbox-header p:last-child{color:#9cafaa;margin:10px 0 0}.ln-inbox-header button,.ln-inbox-actions button{border:1px solid #356d5e;background:#245747;color:#f2faf7;border-radius:10px;padding:10px 14px;font-weight:850;cursor:pointer}.ln-inbox-notice,.ln-inbox-error{box-sizing:border-box;margin-top:18px;padding:11px 13px;border-radius:10px;font-size:.82rem}.ln-inbox-notice{background:#14352e;border:1px solid #316a5b;color:#a8e7d3}.ln-inbox-error{background:#3a2022;border:1px solid #744247;color:#ffc2c5}.ln-inbox-metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:26px}.ln-inbox-metrics article{background:#10232d;border:1px solid #29404a;border-radius:16px;padding:18px}.ln-inbox-metrics span,.ln-inbox-metrics small{display:block;color:#8fa49e}.ln-inbox-metrics strong{display:block;font-size:2rem;margin:6px 0}.ln-inbox-connection{box-sizing:border-box;margin-top:14px;padding:20px;border:1px solid #315348;background:#102a29;border-radius:16px;display:flex;justify-content:space-between;gap:24px;align-items:center}.ln-inbox-connection h2{margin:0;font-size:1.18rem}.ln-inbox-connection p:last-child{margin:7px 0 0;color:#a2b6b0;line-height:1.5}.ln-inbox-connection code{background:#091a1d;border:1px solid #31665a;border-radius:10px;padding:12px 14px;color:#9fe0cc;font-weight:800;white-space:nowrap}.ln-inbox-card{box-sizing:border-box;margin-top:14px;background:#10232d;border:1px solid #29404a;border-radius:20px;padding:20px}.ln-inbox-toolbar{display:flex;justify-content:space-between;gap:14px;align-items:center}.ln-inbox-filters{display:flex;gap:7px}.ln-inbox-filters button{border:1px solid #334a54;background:#0e2029;color:#aebfba;border-radius:999px;padding:8px 14px;font-weight:800;cursor:pointer}.ln-inbox-filters button.active{background:#286451;border-color:#3c806c;color:#fff}.ln-inbox-toolbar input{width:min(390px,100%);border:1px solid #38515e;border-radius:10px;background:#0b1820;color:#edf4f1;padding:10px 12px;font:inherit}.ln-inbox-list{margin-top:18px;display:grid;gap:10px}.ln-inbox-row{display:grid;grid-template-columns:78px 1fr auto;gap:16px;align-items:start;padding:18px;border:1px solid #29434c;border-radius:15px;background:#0e2029}.ln-inbox-channel{display:inline-flex;justify-content:center;align-items:center;border-radius:999px;padding:7px 9px;font-size:.7rem;font-weight:900}.ln-inbox-channel.email{background:#193245;color:#a9d6ef;border:1px solid #31536b}.ln-inbox-channel.linkedin{background:#14382f;color:#9fe0cc;border:1px solid #326b5b}.ln-inbox-title{display:flex;justify-content:space-between;gap:14px}.ln-inbox-title strong{font-size:1.04rem}.ln-inbox-title span,.ln-inbox-copy small{color:#879b95;font-size:.75rem}.ln-inbox-copy h3{margin:9px 0 6px;font-size:.92rem}.ln-inbox-copy p{margin:0;color:#aabbb6;line-height:1.5;font-size:.84rem;white-space:pre-wrap}.ln-inbox-state{display:flex;gap:8px;margin-top:11px;flex-wrap:wrap}.ln-inbox-state span{border:1px solid #354c54;border-radius:999px;padding:4px 8px;color:#a8bab4;font-size:.68rem;font-weight:800}.ln-inbox-state .ok{border-color:#315f51;color:#89d1bc}.ln-inbox-state .warn{border-color:#7a6336;color:#f1ca7d}.ln-inbox-actions{display:grid;gap:7px;min-width:130px}.ln-inbox-actions a,.ln-inbox-actions button{display:flex;justify-content:center;text-align:center;text-decoration:none;border-radius:9px;padding:8px 10px;font-size:.72rem;font-weight:850}.ln-inbox-actions a{border:1px solid #36505a;background:#142b35;color:#dce9e5}.ln-inbox-actions button{border-color:#356d5e}.ln-inbox-empty{padding:54px 20px;text-align:center;color:#9cafaa}.ln-inbox-empty h3{color:#edf4f1}.ln-inbox-auth{width:min(760px,calc(100% - 48px));margin:80px auto;background:#10232d;border:1px solid #29404a;border-radius:18px;padding:28px}.ln-inbox-auth a{color:#98dac6;font-weight:800}@media(max-width:900px){.ln-inbox-metrics{grid-template-columns:repeat(2,1fr)}.ln-inbox-connection{display:grid}.ln-inbox-connection code{white-space:normal;word-break:break-all}.ln-inbox-row{grid-template-columns:1fr}.ln-inbox-channel{justify-self:start}.ln-inbox-actions{grid-template-columns:repeat(2,minmax(0,1fr));width:100%}}@media(max-width:620px){.ln-inbox-page{padding:26px 14px 46px}.ln-inbox-header,.ln-inbox-toolbar{display:grid}.ln-inbox-metrics{grid-template-columns:1fr 1fr}.ln-inbox-toolbar input{width:100%;box-sizing:border-box}.ln-inbox-title{display:grid;gap:5px}.ln-inbox-actions{grid-template-columns:1fr}}
  `}</style>;
}
