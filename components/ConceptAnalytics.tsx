"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

const SESSION_KEY = "labnarrative:concept-session";
const SOURCE_KEY = "labnarrative:concept-source";
const MEDIUM_KEY = "labnarrative:concept-medium";
const CAMPAIGN_KEY = "labnarrative:concept-campaign";
const INTERNAL_DEVICE_COOKIE = "labnarrative_internal_device";

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

    safeSessionSet(SOURCE_KEY, source);
    safeSessionSet(MEDIUM_KEY, medium);
    safeSessionSet(CAMPAIGN_KEY, campaign);

    void fetch("/api/analytics/concept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        slug,
        sessionId: getSessionId(),
        eventType: "page_view",
        path: pathname || "/",
        source,
        medium,
        campaign,
      }),
    }).catch(() => {
      // Analytics is intentionally best-effort and invisible to the visitor.
    });
  }, [pathname, slug]);

  return null;
}
