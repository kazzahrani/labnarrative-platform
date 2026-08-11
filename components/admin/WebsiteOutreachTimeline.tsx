"use client";

type OutreachMessage = {
  message_kind: string;
  status: string;
  sent_at: string | null;
  follow_up_at: string | null;
  created_at: string;
};

type Props = {
  messages: OutreachMessage[];
  outreachStatus?: string | null;
  prospectStatus?: string | null;
  outside?: boolean;
};

const STOPPED = new Set(["replied", "interested", "rejected", "paused", "meeting_scheduled", "proposal_sent", "client"]);
const SENT_GREEN = "#3f8f71";
const SENT_GREEN_BG = "rgba(63,143,113,.11)";
const SENT_GREEN_BORDER = "rgba(63,143,113,.30)";

function stamp(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Riyadh",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

function latest(messages: OutreachMessage[], kind: string) {
  return messages
    .filter((message) => message.message_kind === kind)
    .sort((a, b) => Date.parse(b.sent_at || b.created_at) - Date.parse(a.sent_at || a.created_at))[0];
}

function Step({ label, message, due }: { label: string; message?: OutreachMessage; due?: string | null }) {
  const sent = message?.status === "sent" && Boolean(message.sent_at);
  const sending = message?.status === "sending";
  const tone = sent ? SENT_GREEN : sending ? "#e8ba63" : due ? "#79b9dd" : "#718997";
  const bg = sent ? SENT_GREEN_BG : sending ? "rgba(232,186,99,.10)" : due ? "rgba(121,185,221,.09)" : "rgba(113,137,151,.07)";
  const border = sent ? SENT_GREEN_BORDER : sending ? "rgba(232,186,99,.28)" : due ? "rgba(121,185,221,.24)" : "rgba(113,137,151,.18)";
  const detail = sent ? stamp(message?.sent_at) : sending ? "Sending…" : due ? `Due ${stamp(due)}` : "Pending";

  return (
    <div style={{ minWidth: 92, padding: "7px 9px", borderRadius: 10, background: bg, border: `1px solid ${border}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 5, color: tone, fontSize: ".67rem", fontWeight: 850, whiteSpace: "nowrap" }}>
        <span>{sent ? "✓" : sending ? "◐" : "○"}</span>
        <span>{label}</span>
      </div>
      <div style={{ marginTop: 3, color: sent || due || sending ? tone : "#8298a5", fontSize: ".57rem", fontWeight: 650, whiteSpace: "nowrap" }}>{detail}</div>
    </div>
  );
}

export default function WebsiteOutreachTimeline({ messages, outreachStatus, prospectStatus, outside }: Props) {
  if (outside) {
    return <span style={{ color: "#8ca1ad", fontSize: ".68rem" }}>Outside platform · historical outreach</span>;
  }

  const initial = latest(messages, "initial");
  const f1 = latest(messages, "followup_1");
  const f2 = latest(messages, "followup_2");
  const state = String(prospectStatus || outreachStatus || "").toLowerCase();
  const stopped = STOPPED.has(state);

  const f1Due = !f1?.sent_at && initial?.status === "sent" ? initial.follow_up_at : null;
  const f2Due = !f2?.sent_at && f1?.status === "sent" ? f1.follow_up_at : null;
  const hasSequence = Boolean(initial || f1 || f2);

  if (!hasSequence) {
    return (
      <div style={{ display: "grid", gap: 3 }}>
        <strong style={{ color: "#8ca1ad", fontSize: ".68rem" }}>Not started</strong>
        <span style={{ color: "#6f8794", fontSize: ".59rem" }}>No outreach sequence</span>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 6, minWidth: 330 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <Step label="Email 1" message={initial} />
        <span style={{ color: "#506b78", fontWeight: 900 }}>›</span>
        <Step label="Follow-up 1" message={f1} due={stopped ? null : f1Due} />
        <span style={{ color: "#506b78", fontWeight: 900 }}>›</span>
        <Step label="Follow-up 2" message={f2} due={stopped ? null : f2Due} />
      </div>
      {stopped ? (
        <div style={{ display: "flex", alignItems: "center", gap: 7, minHeight: 15 }}>
          <span style={{ color: state === "interested" || state === "replied" || state === "client" ? SENT_GREEN : "#9cb0ba", fontSize: ".59rem", fontWeight: 800 }}>
            Sequence stopped · {state.replaceAll("_", " ")}
          </span>
        </div>
      ) : f2?.status === "sent" ? (
        <div style={{ display: "flex", alignItems: "center", gap: 7, minHeight: 15 }}>
          <span style={{ color: "#8ca1ad", fontSize: ".59rem", fontWeight: 750 }}>Sequence complete</span>
        </div>
      ) : null}
    </div>
  );
}
