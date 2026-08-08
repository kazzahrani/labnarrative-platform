"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

const SESSION_KEY = "labnarrative:concept-session";
const SOURCE_KEY = "labnarrative:concept-source";
const MEDIUM_KEY = "labnarrative:concept-medium";
const CAMPAIGN_KEY = "labnarrative:concept-campaign";
const ENGAGED_KEY = "labnarrative:concept-engaged";
const INTERNAL_DEVICE_COOKIE = "labnarrative_internal_device";
const ENGAGEMENT_DWELL_MS = 10_000;
const ENGAGEMENT_SCROLL_PX = 120;

function safeSessionGet(key: string): string {
  try {
    return window.sessionStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function safeSessionSet(key: string, value: string) {
  if (!value) return;
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // Analytics must never interfere with the concept website.
  }
}

function safeSessionRemove(key: string) {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Analytics must never interfere with the concept website.
  }
}

function hasInternalDeviceCookie(): boolean {
  try {
    return document.cookie
      .split(";")
      .some((entry) => entry.trim() === `${INTERNAL_DEVICE_COOKIE}=1`);
  } catch {
    return false;
  }
}

function getSessionId(): string {
  const existing = safeSessionGet(SESSION_KEY);
  if (existing) return existing;

  const next = crypto.randomUUID();
  safeSessionSet(SESSION_KEY, next);
  return next;
}

export default function ConceptAnalytics({ slug }: { slug: string }) {
  const pathname = usePathname();

  useEffect(() => {
    const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "labnarrative.com";
    const host = window.location.hostname.toLowerCase();

    // Count only real public LabNarrative concept subdomains. This excludes
    // localhost, Vercel previews, the main marketing site, /admin previews,
    // and devices explicitly marked as LabNarrative internal devices.
    if (
      host === "localhost"
      || host.endsWith(".vercel.app")
      || host === rootDomain
      || host === `www.${rootDomain}`
      || host === `platform.${rootDomain}`
      || !host.endsWith(`.${rootDomain}`)
      || hasInternalDeviceCookie()
    ) {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const source = params.get("utm_source")?.slice(0, 120) || safeSessionGet(SOURCE_KEY);
    const medium = params.get("utm_medium")?.slice(0, 120) || safeSessionGet(MEDIUM_KEY);
    const campaign = params.get("utm_campaign")?.slice(0, 180) || safeSessionGet(CAMPAIGN_KEY);
    const sessionId = getSessionId();

    safeSessionSet(SOURCE_KEY, source);
    safeSessionSet(MEDIUM_KEY, medium);
    safeSessionSet(CAMPAIGN_KEY, campaign);

    async function sendEvent(eventType: "page_view" | "engaged_visit") {
      const response = await fetch("/api/analytics/concept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify({
          slug,
          sessionId,
          eventType,
          path: pathname || "/",
          source,
          medium,
          campaign,
        }),
      });

      if (!response.ok) throw new Error(`Analytics request failed: ${response.status}`);
    }

    // Raw page loads remain available as diagnostic data. They do not count as
    // qualified sales visits unless this browser session later demonstrates
    // human engagement.
    void sendEvent("page_view").catch(() => {
      // Analytics is intentionally best-effort and invisible to the visitor.
    });

    // One qualified engagement event per browser-tab session. A session is
    // qualified after either explicit human interaction or 10 seconds of
    // accumulated visible, focused dwell time.
    if (safeSessionGet(ENGAGED_KEY)) return;

    let disposed = false;
    let timerId: ReturnType<typeof setTimeout> | null = null;
    let visibleStartedAt = 0;
    let remainingVisibleMs = ENGAGEMENT_DWELL_MS;
    const initialScrollY = window.scrollY;

    const stopVisibleTimer = () => {
      if (timerId === null) return;
      clearTimeout(timerId);
      timerId = null;
      if (visibleStartedAt > 0) {
        remainingVisibleMs = Math.max(0, remainingVisibleMs - (Date.now() - visibleStartedAt));
        visibleStartedAt = 0;
      }
    };

    const markEngaged = () => {
      if (disposed || safeSessionGet(ENGAGED_KEY)) return;

      stopVisibleTimer();
      safeSessionSet(ENGAGED_KEY, "pending");

      void sendEvent("engaged_visit")
        .then(() => {
          safeSessionSet(ENGAGED_KEY, "1");
        })
        .catch(() => {
          // Permit another qualifying signal to retry if delivery failed.
          safeSessionRemove(ENGAGED_KEY);
        });
    };

    const startVisibleTimer = () => {
      if (
        timerId !== null
        || remainingVisibleMs <= 0
        || document.visibilityState !== "visible"
        || !document.hasFocus()
        || safeSessionGet(ENGAGED_KEY)
      ) {
        return;
      }

      visibleStartedAt = Date.now();
      timerId = setTimeout(markEngaged, remainingVisibleMs);
    };

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === "visible" && document.hasFocus()) {
        startVisibleTimer();
      } else {
        stopVisibleTimer();
      }
    };

    const handleScroll = () => {
      if (Math.abs(window.scrollY - initialScrollY) >= ENGAGEMENT_SCROLL_PX) markEngaged();
    };

    const handleInteraction = () => markEngaged();

    document.addEventListener("visibilitychange", handleVisibilityOrFocus);
    window.addEventListener("focus", handleVisibilityOrFocus);
    window.addEventListener("blur", handleVisibilityOrFocus);
    window.addEventListener("pointerdown", handleInteraction, { passive: true });
    window.addEventListener("touchstart", handleInteraction, { passive: true });
    window.addEventListener("keydown", handleInteraction);
    window.addEventListener("scroll", handleScroll, { passive: true });
    startVisibleTimer();

    return () => {
      disposed = true;
      stopVisibleTimer();
      document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
      window.removeEventListener("focus", handleVisibilityOrFocus);
      window.removeEventListener("blur", handleVisibilityOrFocus);
      window.removeEventListener("pointerdown", handleInteraction);
      window.removeEventListener("touchstart", handleInteraction);
      window.removeEventListener("keydown", handleInteraction);
      window.removeEventListener("scroll", handleScroll);
    };
  }, [pathname, slug]);

  return null;
}
