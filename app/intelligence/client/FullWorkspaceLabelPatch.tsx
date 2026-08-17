"use client";

import { useEffect } from "react";
import styles from "./client.module.css";
import { intelligenceAuth, intelligenceFunctionsBase } from "./authClient";

type ProductLink = { status?: string; webReportUrl?: string };

export default function FullWorkspaceLabelPatch() {
  useEffect(() => {
    let cancelled = false;
    let products: ProductLink[] = [];

    const loadLinks = async () => {
      try {
        const session = await intelligenceAuth.auth.getSession();
        const access = session.data.session?.access_token;
        if (!access) return;
        const response = await fetch(`${intelligenceFunctionsBase}/intelligence-client-portal`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${access}` },
          body: JSON.stringify({ action: "load" }),
          cache: "no-store",
        });
        if (!response.ok) return;
        const payload = await response.json();
        if (!cancelled) products = Array.isArray(payload.products) ? payload.products.filter((p: ProductLink) => p.status !== "awaiting_product") : [];
      } catch {}
    };

    const apply = () => {
      document.querySelectorAll<HTMLAnchorElement>('a[href*="labintelligence-production-v2-lab-narrative.vercel.app/experience"]').forEach((anchor) => {
        if (/OPEN WEB REPORT/i.test(anchor.textContent || "")) anchor.textContent = "OPEN FULL INTELLIGENCE →";
        anchor.setAttribute("aria-label", "Open the full Intelligence workspace for this paid product");
      });

      const rows = Array.from(document.querySelectorAll<HTMLElement>('[class*="analysisRow"]'));
      rows.forEach((row, index) => {
        const product = products[index];
        const url = String(product?.webReportUrl || "");
        if (!url.includes("labintelligence-production-v2-lab-narrative.vercel.app/experience")) return;
        if (row.querySelector('[data-full-intelligence-link="1"]')) return;
        const link = document.createElement("a");
        link.dataset.fullIntelligenceLink = "1";
        link.href = url;
        link.target = "_blank";
        link.rel = "noreferrer";
        link.className = styles.secondary;
        link.textContent = "OPEN FULL INTELLIGENCE →";
        link.setAttribute("aria-label", "Open the full Intelligence workspace for this paid product");
        row.appendChild(link);
      });
    };

    void loadLinks().then(apply);
    const observer = new MutationObserver(apply);
    observer.observe(document.body, { childList: true, subtree: true });
    const refresh = window.setInterval(() => { void loadLinks().then(apply); }, 15000);
    return () => { cancelled = true; observer.disconnect(); window.clearInterval(refresh); };
  }, []);
  return null;
}
