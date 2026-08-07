"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { browserSupabase as supabase } from "@/lib/supabase-browser";

type Prospect = { pi_name?: string; institution?: string; status?: string };
type Message = {
  id: string;
  prospect_id: string;
  message_kind: string;
  status: string;
  sent_at: string | null;
  follow_up_at: string | null;
  delivery_status: string | null;
  error_message: string | null;
  prospects: Prospect | null;
};
type Sequence = {
  prospectId: string;
  piName: string;
  institution: string;
  prospectStatus: string;
  initial?: Message;
  follow1?: Message;
  follow2?: Message;
};

const blocked = new Set(["bounced", "complained", "failed", "suppressed"]);
const card: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,.08)", borderRadius: 16, padding: 20,
  background: "rgba(18,35,48,.78)", color: "inherit", boxShadow: "0 12px 34px rgba(0,0,0,.16)", minWidth: 0,
};
const button: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,.12)", borderRadius: 9, padding: "7px 10px", background: "rgba(255,255,255,.04)",
  color: "inherit", font: "inherit", fontSize: ".72rem", fontWeight: 750, cursor: "pointer",
};

function fmt(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Riyadh", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
}

function derive(sequence: Sequence) {
  const { initial, follow1, follow2, prospectStatus } = sequence;
  if (prospectStatus === "replied") return { label: "Replied · stopped", tone: "#52c794", next: "No further email" };
  if (prospectStatus === "interested") return { label: "Interested · stopped", tone: "#52c794", next: "No further email" };
  const latestSent = [follow2, follow1, initial].find((m) => m?.status === "sent");
  if (latestSent?.delivery_status && blocked.has(latestSent.delivery_status)) return { label: `Stopped · ${latestSent.delivery_status}`, tone: "#e58b75", next: "No further email" };
  if (follow2?.status === "sent") return { label: "Complete", tone: "#8ba4b8", next: "Sequence finished" };
  if (follow1?.status === "sent") return { label: "Follow-up 1 sent", tone: "#76b7d8", next: follow1.follow_up_at ? `Follow-up 2 · ${fmt(follow1.follow_up_at)}` : "Sequence stopped" };
  if (initial?.status === "sent") return { label: "Email 1 sent", tone: "#76b7d8", next: initial.follow_up_at ? `Follow-up 1 · ${fmt(initial.follow_up_at)}` : "Sequence stopped" };
  return { label: "Not active", tone: "#8ba4b8", next: "—" };
}

export default function OutreachSequencePanel() {
  const [mount, setMount] = useState<HTMLElement | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string>("");
  const [error, setError] = useState("");
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || window.location.pathname !== "/admin/automation") return;
    let disposed = false;
    let node: HTMLDivElement | null = null;
    const place = () => {
      if (disposed) return;
      const anchor = document.querySelector<HTMLElement>("[data-live-production-queue='true']");
      if (!anchor?.parentElement) return;
      if (!node) {
        node = document.createElement("div");
        node.dataset.outreachSequencePanel = "true";
        anchor.insertAdjacentElement("afterend", node);
        setMount(node);
      } else if (node.previousElementSibling !== anchor) {
        anchor.insertAdjacentElement("afterend", node);
      }
    };
    place();
    const observer = new MutationObserver(place);
    observer.observe(document.body, { childList: true, subtree: true });
    const timer = window.setInterval(place, 700);
    return () => { disposed = true; observer.disconnect(); window.clearInterval(timer); node?.remove(); setMount(null); };
  }, []);

  const load = useCallback(async () => {
    const { data, error: loadError } = await supabase
      .from("outreach_messages")
      .select("id,prospect_id,message_kind,status,sent_at,follow_up_at,delivery_status,error_message,prospects(pi_name,institution,status)")
      .eq("is_test", false)
      .in("message_kind", ["initial", "followup_1", "followup_2"])
      .order("created_at", { ascending: false })
      .limit(400);
    if (loadError) { setError(loadError.message); setLoading(false); return; }
    setMessages((data || []) as unknown as Message[]);
    setError(""); setLoading(false);
  }, []);

  useEffect(() => {
    if (!mount) return;
    void load();
    const poll = window.setInterval(() => void load(), 15000);
    const channel = supabase.channel("labnarrative-outreach-sequences")
      .on("postgres_changes", { event: "*", schema: "public", table: "outreach_messages" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "prospects" }, () => void load())
      .subscribe();
    return () => { window.clearInterval(poll); void supabase.removeChannel(channel); };
  }, [load, mount]);

  const sequences = useMemo(() => {
    const map = new Map<string, Sequence>();
    for (const message of [...messages].reverse()) {
      if (!map.has(message.prospect_id)) map.set(message.prospect_id, { prospectId: message.prospect_id, piName: message.prospects?.pi_name || "PI", institution: message.prospects?.institution || "", prospectStatus: message.prospects?.status || "" });
      const row = map.get(message.prospect_id)!;
      row.piName = message.prospects?.pi_name || row.piName;
      row.institution = message.prospects?.institution || row.institution;
      row.prospectStatus = message.prospects?.status || row.prospectStatus;
      if (message.message_kind === "initial" && message.status === "sent") row.initial = message;
      if (message.message_kind === "followup_1") row.follow1 = message;
      if (message.message_kind === "followup_2") row.follow2 = message;
    }
    return Array.from(map.values())
      .filter((s) => s.initial)
      .sort((a, b) => new Date(b.follow2?.sent_at || b.follow1?.sent_at || b.initial?.sent_at || 0).getTime() - new Date(a.follow2?.sent_at || a.follow1?.sent_at || a.initial?.sent_at || 0).getTime());
  }, [messages]);

  const activeCount = sequences.filter((s) => {
    const state = derive(s); return state.label === "Email 1 sent" || state.label === "Follow-up 1 sent";
  }).length;
  const visible = showAll ? sequences : sequences.slice(0, 8);

  async function stop(prospectId: string) {
    if (!window.confirm("Stop all remaining follow-ups for this PI?")) return;
    setWorking(prospectId); setError("");
    const { error: rpcError } = await supabase.rpc("manual_stop_outreach_sequence", { p_prospect_id: prospectId });
    if (rpcError) setError(rpcError.message); else await load();
    setWorking("");
  }

  async function sendNext(prospectId: string) {
    if (!window.confirm("Send this PI's next scheduled follow-up now?")) return;
    setWorking(prospectId); setError("");
    const due = await supabase.rpc("force_outreach_followup_due", { p_prospect_id: prospectId });
    if (due.error) { setError(due.error.message); setWorking(""); return; }
    const result = await supabase.functions.invoke("outreach-sequence-worker", { body: { forceProspectId: prospectId } });
    if (result.error) setError(result.error.message); else if ((result.data as { failures?: unknown[] } | null)?.failures?.length) setError("The follow-up worker returned a delivery failure.");
    await load(); setWorking("");
  }

  if (!mount) return null;
  return createPortal(
    <section style={{ ...card, marginTop: 14 }} aria-label="Outreach sequences">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 14 }}>
        <div><p style={{ margin: 0, opacity: .58, textTransform: "uppercase", letterSpacing: ".08em", fontSize: ".68rem", fontWeight: 800 }}>Outreach sequences</p><h2 style={{ margin: "5px 0 3px", fontSize: "1.15rem" }}>Three-message follow-up</h2><p style={{ margin: 0, opacity: .66, fontSize: ".78rem" }}>{activeCount} active sequence{activeCount === 1 ? "" : "s"} · automatic unless stopped by reply/delivery</p></div>
        <span style={{ padding: "5px 8px", borderRadius: 999, background: "rgba(82,199,148,.12)", color: "#52c794", fontSize: ".68rem", fontWeight: 800 }}>LIVE</span>
      </div>
      {loading ? <p style={{ opacity: .65 }}>Loading outreach sequences…</p> : null}
      {error ? <p style={{ color: "#e58b75", fontWeight: 700, fontSize: ".76rem" }}>{error}</p> : null}
      <div style={{ display: "grid", gap: 8 }}>
        {visible.map((sequence) => {
          const state = derive(sequence);
          const active = state.label === "Email 1 sent" || state.label === "Follow-up 1 sent";
          return <div key={sequence.prospectId} style={{ border: "1px solid rgba(255,255,255,.07)", borderRadius: 11, padding: "10px 11px", background: "rgba(255,255,255,.025)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
              <div style={{ minWidth: 0 }}><strong style={{ display: "block", fontSize: ".82rem" }}>{sequence.piName}</strong><small style={{ opacity: .58, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 360 }}>{sequence.institution}</small></div>
              <span style={{ color: state.tone, fontSize: ".7rem", fontWeight: 800, whiteSpace: "nowrap" }}>{state.label}</span>
            </div>
            <div style={{ display: "flex", gap: 7, alignItems: "center", marginTop: 8, flexWrap: "wrap", fontSize: ".7rem" }}>
              <span style={{ opacity: sequence.initial?.status === "sent" ? 1 : .38 }}>✓ Email 1</span><span style={{ opacity: .3 }}>→</span>
              <span style={{ opacity: sequence.follow1?.status === "sent" ? 1 : .55 }}>{sequence.follow1?.status === "sent" ? "✓" : "○"} Follow-up 1</span><span style={{ opacity: .3 }}>→</span>
              <span style={{ opacity: sequence.follow2?.status === "sent" ? 1 : .55 }}>{sequence.follow2?.status === "sent" ? "✓" : "○"} Follow-up 2</span>
            </div>
            <div style={{ marginTop: 7, display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <small style={{ opacity: .65 }}>{state.next}</small>
              {active ? <div style={{ display: "flex", gap: 6 }}><button disabled={working === sequence.prospectId} onClick={() => void sendNext(sequence.prospectId)} style={{ ...button, opacity: working === sequence.prospectId ? .5 : 1 }}>Send next now</button><button disabled={working === sequence.prospectId} onClick={() => void stop(sequence.prospectId)} style={{ ...button, opacity: working === sequence.prospectId ? .5 : 1 }}>Stop sequence</button></div> : null}
            </div>
          </div>;
        })}
      </div>
      {sequences.length > 8 ? <button type="button" onClick={() => setShowAll((v) => !v)} style={{ ...button, marginTop: 10 }}>{showAll ? "Show recent only" : `Show all ${sequences.length}`}</button> : null}
    </section>, mount,
  );
}
