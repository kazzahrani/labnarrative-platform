"use client";

import { useEffect } from "react";

const ENDPOINT = "https://app.labnarrative.com/api/growth/public-event";
const VISITOR_KEY = "ln_public_growth_visitor_v1";
const SESSION_KEY = "ln_public_growth_session_v1";
const SESSION_TIMEOUT = 30 * 60 * 1000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type SessionState = { id: string; lastSeenAt: number };

function visitorId() {
  try {
    const existing = localStorage.getItem(VISITOR_KEY) || "";
    if (UUID_RE.test(existing)) return existing;
    const id = crypto.randomUUID();
    localStorage.setItem(VISITOR_KEY, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

function sessionId() {
  const now = Date.now();
  try {
    const parsed = JSON.parse(localStorage.getItem(SESSION_KEY) || "null") as SessionState | null;
    if (parsed && UUID_RE.test(parsed.id) && Number.isFinite(parsed.lastSeenAt) && now - parsed.lastSeenAt <= SESSION_TIMEOUT) {
      const next = { ...parsed, lastSeenAt: now };
      localStorage.setItem(SESSION_KEY, JSON.stringify(next));
      return next.id;
    }
    const next = { id: crypto.randomUUID(), lastSeenAt: now };
    localStorage.setItem(SESSION_KEY, JSON.stringify(next));
    return next.id;
  } catch {
    return crypto.randomUUID();
  }
}

function touch() {
  const query = new URLSearchParams(location.search);
  return {
    landingPath: location.pathname + location.search,
    referrer: document.referrer || "",
    utmSource: query.get("utm_source") || "",
    utmMedium: query.get("utm_medium") || "",
    utmCampaign: query.get("utm_campaign") || "",
    utmContent: query.get("utm_content") || "",
    utmTerm: query.get("utm_term") || "",
  };
}

async function send(eventName: "page_view" | "competitor_cta_click", competitor: string, ids: { visitorId: string; sessionId: string }) {
  try {
    await fetch(ENDPOINT, {
      method: "POST",
      mode: "cors",
      keepalive: true,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...ids,
        ...touch(),
        eventName,
        path: location.pathname,
        competitor,
      }),
    });
  } catch {}
}

export default function PublicComparisonTracker({ competitor }: { competitor: string }) {
  useEffect(() => {
    const ids = { visitorId: visitorId(), sessionId: sessionId() };
    void send("page_view", competitor, ids);

    const click = (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement | null)?.closest?.("a[data-competitor-growth]") as HTMLAnchorElement | null;
      if (!anchor) return;
      try {
        const url = new URL(anchor.href);
        if (url.hostname !== "app.labnarrative.com") return;
        url.searchParams.set("lnv", ids.visitorId);
        url.searchParams.set("lns", ids.sessionId);
        if (!url.searchParams.get("utm_source")) url.searchParams.set("utm_source", "competitor_page");
        if (!url.searchParams.get("utm_medium")) url.searchParams.set("utm_medium", "organic");
        if (!url.searchParams.get("utm_campaign")) url.searchParams.set("utm_campaign", `${competitor}-alternative`);
        anchor.href = url.toString();
        void send("competitor_cta_click", competitor, ids);
      } catch {}
    };

    document.addEventListener("click", click, true);
    return () => document.removeEventListener("click", click, true);
  }, [competitor]);

  return null;
}
