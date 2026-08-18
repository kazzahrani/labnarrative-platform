"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const SYSTEMS_PATHS = new Set(["/admin/systems", "/admin/systems/acquire", "/admin/systems-outreach"]);

function normalizeLinkedInStatus(value: string) {
  const text = value.trim().toLowerCase();
  if (!text) return value;

  // Keep the negative state stable. This check MUST come before the generic
  // "contacted" match because "not contacted" contains the word "contacted".
  // Without this guard the MutationObserver would turn:
  // Ready -> Not contacted -> Contacted on its second pass.
  if (text === "not contacted" || text.includes("not contacted")) return "Not contacted";

  if (text.includes("replied")) return "Replied";
  if (text.includes("sent") || text.includes("connected") || text.includes("follow-up") || text === "contacted") return "Contacted";
  if (text.includes("ready") || text.includes("draft") || text.includes("no target")) return "Not contacted";
  return value;
}

function removeConnectedControls() {
  document.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
    if (button.textContent?.trim() !== "Connected") return;
    const parent = button.parentElement;
    if (!parent) return;
    const siblingLabels = Array.from(parent.querySelectorAll("button")).map((item) => item.textContent?.trim());
    if (siblingLabels.includes("Contacted") && siblingLabels.includes("Replied")) button.remove();
  });
}

function normalizeQueueTables() {
  document.querySelectorAll<HTMLTableElement>("table").forEach((table) => {
    const headers = Array.from(table.querySelectorAll("thead th")).map((th) => th.textContent?.trim().toLowerCase() || "");
    const linkedinStatusIndex = headers.findIndex((header) => header.includes("linkedin") && header.includes("status"));

    if (linkedinStatusIndex >= 0) {
      table.querySelectorAll<HTMLTableRowElement>("tbody tr").forEach((row) => {
        const cells = Array.from(row.querySelectorAll<HTMLTableCellElement>("td"));
        const cell = cells[linkedinStatusIndex];
        if (!cell) return;
        const target = cell.querySelector<HTMLElement>("span") ?? cell;
        const next = normalizeLinkedInStatus(target.textContent || cell.textContent || "");
        if (next !== (target.textContent || "").trim()) target.textContent = next;
      });
      return;
    }

    const channelIndex = headers.findIndex((header) => header === "channel");
    const statusIndex = headers.findIndex((header) => header === "status");
    if (channelIndex < 0 || statusIndex < 0) return;

    table.querySelectorAll<HTMLTableRowElement>("tbody tr").forEach((row) => {
      const cells = Array.from(row.querySelectorAll<HTMLTableCellElement>("td"));
      if ((cells[channelIndex]?.textContent || "").trim().toLowerCase() !== "linkedin") return;
      const cell = cells[statusIndex];
      if (!cell) return;
      const target = cell.querySelector<HTMLElement>("span") ?? cell;
      const next = normalizeLinkedInStatus(target.textContent || cell.textContent || "");
      if (next !== (target.textContent || "").trim()) target.textContent = next;
    });
  });
}

export default function SystemsConnectedFilterEnhancer() {
  const pathname = usePathname();

  useEffect(() => {
    if (!SYSTEMS_PATHS.has(pathname)) return;

    const apply = () => {
      removeConnectedControls();
      normalizeQueueTables();
    };

    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [pathname]);

  return null;
}
