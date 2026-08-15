"use client";

import { createClient, type Session } from "@supabase/supabase-js";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
);

function findQueueFilters() {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("button"));
  const contacted = buttons.find((button) => {
    if (button.textContent?.trim() !== "Contacted") return false;
    const parent = button.parentElement;
    if (!parent) return false;
    const labels = Array.from(parent.querySelectorAll("button")).map((item) => item.textContent?.trim());
    return labels.includes("All") && labels.includes("Ready to send") && labels.includes("Replied");
  });
  if (!contacted?.parentElement) return null;
  const parent = contacted.parentElement;
  const replied = Array.from(parent.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.textContent?.trim() === "Replied") ?? null;
  const all = Array.from(parent.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.textContent?.trim() === "All") ?? null;
  return replied && all ? { parent, contacted, replied, all } : null;
}

export default function SystemsConnectedFilterEnhancer() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== "/admin/systems" && pathname !== "/admin/systems-outreach") return;

    let disposed = false;
    let connectedCompanies = new Set<string>();
    let connectedMode = false;
    let internalAllClick = false;
    let connectedButton: HTMLButtonElement | null = null;
    let observer: MutationObserver | null = null;

    const loadConnected = async (session: Session) => {
      const { data: role } = await supabase.from("user_roles").select("role").eq("user_id", session.user.id).maybeSingle();
      if (role?.role !== "admin") return;
      const { data } = await supabase.from("systems_outreach_prospects").select("company_name").eq("status", "connected");
      if (disposed) return;
      connectedCompanies = new Set((data ?? []).map((row) => String(row.company_name).trim()));
      if (connectedMode) applyConnectedRows();
    };

    const restoreRows = () => {
      document.querySelectorAll<HTMLTableRowElement>("table tbody tr").forEach((row) => {
        row.style.display = "";
      });
    };

    const applyConnectedRows = () => {
      if (!connectedMode) return;
      const filters = findQueueFilters();
      if (!filters) return;
      document.querySelectorAll<HTMLTableRowElement>("table tbody tr").forEach((row) => {
        const company = row.querySelector("td span")?.textContent?.trim() ?? "";
        row.style.display = connectedCompanies.has(company) ? "" : "none";
      });
      if (connectedButton) {
        connectedButton.className = filters.all.className;
        filters.all.className = filters.contacted.className;
      }
    };

    const deactivateConnected = () => {
      if (!connectedMode) return;
      connectedMode = false;
      restoreRows();
      const filters = findQueueFilters();
      if (filters && connectedButton) connectedButton.className = filters.contacted.className;
    };

    const ensureButton = () => {
      if (disposed) return;
      const filters = findQueueFilters();
      if (!filters) return;
      const existing = Array.from(filters.parent.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.dataset.systemsConnectedFilter === "true");
      if (existing) {
        connectedButton = existing;
        return;
      }

      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "Connected";
      button.dataset.systemsConnectedFilter = "true";
      button.className = filters.contacted.className;
      button.addEventListener("click", () => {
        internalAllClick = true;
        filters.all.click();
        internalAllClick = false;
        connectedMode = true;
        connectedButton = button;
        window.setTimeout(applyConnectedRows, 0);
      });
      filters.parent.insertBefore(button, filters.replied);
      connectedButton = button;

      Array.from(filters.parent.querySelectorAll<HTMLButtonElement>("button")).forEach((nativeButton) => {
        if (nativeButton === button) return;
        nativeButton.addEventListener("click", () => {
          if (!internalAllClick) deactivateConnected();
        });
      });
    };

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) void loadConnected(data.session);
    });

    ensureButton();
    observer = new MutationObserver(() => {
      ensureButton();
      if (connectedMode) applyConnectedRows();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      disposed = true;
      observer?.disconnect();
      restoreRows();
      connectedButton?.remove();
    };
  }, [pathname]);

  return null;
}
