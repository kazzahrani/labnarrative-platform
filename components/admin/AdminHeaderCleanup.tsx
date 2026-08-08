"use client";

import { createClient } from "@supabase/supabase-js";
import { useEffect } from "react";

const WORKSPACE_PATHS = new Set([
  "/admin/discovery",
  "/admin/automation",
  "/admin/sites",
  "/admin/sales",
]);

const LEGACY_ADMIN_PATHS = new Set([
  "/admin",
  "/admin/discovery",
  "/admin/automation",
  "/admin/sites",
  "/admin/sales",
  "/",
]);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
);

function pathFor(link: HTMLAnchorElement): string {
  try {
    return new URL(link.href, window.location.origin).pathname;
  } catch {
    return link.getAttribute("href") || "";
  }
}

function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function utilityContainer(header: HTMLElement): HTMLElement | null {
  const nav = header.querySelector<HTMLElement>("nav");
  if (nav) return nav;
  const directChildren = Array.from(header.children).filter((node): node is HTMLElement => node instanceof HTMLElement);
  return directChildren.at(-1) || null;
}

export default function AdminHeaderCleanup() {
  useEffect(() => {
    if (!WORKSPACE_PATHS.has(window.location.pathname)) return;

    let disposed = false;
    let adminEmail = "";

    const apply = () => {
      if (disposed) return;
      const main = document.querySelector("main");
      const header = main?.querySelector<HTMLElement>("header") || document.querySelector<HTMLElement>("header");
      if (!header) return;

      const utilities = utilityContainer(header);
      if (!utilities) return;

      header.querySelectorAll<HTMLAnchorElement>("nav a[href], a[href]").forEach((link) => {
        if (!LEGACY_ADMIN_PATHS.has(pathFor(link))) return;
        if (link.closest("nav") || window.location.pathname === "/admin/sales") link.remove();
      });

      utilities.querySelectorAll<HTMLElement>("span:not([data-admin-header-email])").forEach((span) => {
        if (looksLikeEmail(span.textContent || "")) span.remove();
      });
      utilities.querySelectorAll<HTMLButtonElement>("button:not([data-admin-header-signout])").forEach((button) => {
        const label = (button.textContent || "").trim().toLowerCase();
        if (label === "sign out") button.remove();
      });

      if (window.location.pathname === "/admin/sales") {
        utilities.querySelectorAll<HTMLButtonElement>("button:not([data-admin-header-signout])").forEach((button) => {
          const label = (button.textContent || "").trim().toLowerCase();
          const isDevice = label.includes("device") || label.includes("checking device");
          if (!isDevice) button.remove();
        });
      } else {
        utilities.querySelectorAll<HTMLButtonElement>("button:not([data-admin-header-signout])").forEach((button) => button.remove());
      }

      let email = utilities.querySelector<HTMLElement>("[data-admin-header-email='true']");
      if (adminEmail) {
        if (!email) {
          email = document.createElement("span");
          email.dataset.adminHeaderEmail = "true";
          email.style.whiteSpace = "nowrap";
          email.style.fontSize = ".78rem";
          email.style.fontWeight = "650";
          email.style.opacity = ".82";
          utilities.appendChild(email);
        }
        if (email.textContent !== adminEmail) email.textContent = adminEmail;
      }

      let signOut = utilities.querySelector<HTMLButtonElement>("[data-admin-header-signout='true']");
      if (!signOut) {
        signOut = document.createElement("button");
        signOut.dataset.adminHeaderSignout = "true";
        signOut.type = "button";
        signOut.textContent = "Sign out";
        signOut.style.minHeight = "34px";
        signOut.style.padding = "0 12px";
        signOut.style.border = "1px solid rgba(148,163,184,.28)";
        signOut.style.borderRadius = "9px";
        signOut.style.background = "#182630";
        signOut.style.color = "#d9e0e6";
        signOut.style.font = "inherit";
        signOut.style.fontSize = ".72rem";
        signOut.style.fontWeight = "750";
        signOut.style.cursor = "pointer";
        signOut.addEventListener("click", async () => {
          if (!signOut) return;
          signOut.disabled = true;
          signOut.textContent = "Signing out…";
          await supabase.auth.signOut();
          window.location.assign("/admin");
        });
        utilities.appendChild(signOut);
      }

      // Exact order: optional Sales device control, admin email, Sign out.
      if (email && email.nextElementSibling !== signOut) {
        utilities.insertBefore(email, signOut);
      }
      if (signOut !== utilities.lastElementChild) {
        utilities.appendChild(signOut);
      }

      if (window.location.pathname !== "/admin/sales") return;

      const title = header.querySelector<HTMLElement>("h1");
      const kicker = title?.previousElementSibling as HTMLElement | null;
      const subtitle = title?.nextElementSibling as HTMLElement | null;
      if (kicker) kicker.style.display = "none";
      if (title) title.style.display = "none";
      if (subtitle) subtitle.style.display = "none";
      header.style.marginBottom = "0";
      header.style.alignItems = "center";

      const tabsMount = document.querySelector<HTMLElement>("[data-admin-workspace-tabs='true']");
      if (!tabsMount?.parentElement || !title) return;

      let hero = document.querySelector<HTMLElement>("[data-sales-workspace-hero='true']");
      if (!hero) {
        hero = document.createElement("section");
        hero.dataset.salesWorkspaceHero = "true";
        hero.style.padding = "28px 0 26px";
        hero.style.maxWidth = "850px";
      }

      if (!hero.childElementCount) {
        if (kicker) {
          const clone = kicker.cloneNode(true) as HTMLElement;
          clone.style.display = "";
          hero.appendChild(clone);
        }
        const titleClone = title.cloneNode(true) as HTMLElement;
        titleClone.style.display = "";
        hero.appendChild(titleClone);
        if (subtitle) {
          const clone = subtitle.cloneNode(true) as HTMLElement;
          clone.style.display = "";
          hero.appendChild(clone);
        }
      }

      if (tabsMount.nextElementSibling !== hero) tabsMount.insertAdjacentElement("afterend", hero);
    };

    void supabase.auth.getSession().then(({ data }) => {
      if (disposed) return;
      adminEmail = data.session?.user.email || "";
      apply();
    });

    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.body, { childList: true, subtree: true });
    const timer = window.setInterval(apply, 700);

    return () => {
      disposed = true;
      observer.disconnect();
      window.clearInterval(timer);
      document.querySelector("[data-sales-workspace-hero='true']")?.remove();
      document.querySelectorAll("[data-admin-header-email], [data-admin-header-signout]").forEach((node) => node.remove());
    };
  }, []);

  return null;
}
