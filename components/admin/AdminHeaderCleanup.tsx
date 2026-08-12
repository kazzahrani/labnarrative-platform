"use client";

import { createClient } from "@supabase/supabase-js";
import { useEffect } from "react";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
);

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
    if (!window.location.pathname.startsWith("/admin")) return;

    let disposed = false;
    let adminEmail = "";

    const apply = () => {
      if (disposed) return;

      const main = document.querySelector("main");
      const header = main?.querySelector<HTMLElement>("header") || document.querySelector<HTMLElement>("header");
      if (!header) return;

      const utilities = utilityContainer(header);
      if (!utilities) return;

      // Global, immutable admin-header shell.
      header.dataset.adminStableHeader = "true";
      header.style.minHeight = "84px";
      header.style.height = "84px";
      header.style.boxSizing = "border-box";
      header.style.padding = "0 30px";
      header.style.margin = "0";
      header.style.display = "flex";
      header.style.alignItems = "center";
      header.style.justifyContent = "space-between";
      header.style.gap = "24px";
      header.style.borderBottom = "1px solid rgba(148,163,184,.18)";
      header.style.background = "#14232d";
      header.style.color = "#eef4f1";
      header.style.fontFamily = "inherit";

      // Keep only the page identity on the left and email + sign out on the right.
      utilities.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((link) => link.remove());
      utilities.querySelectorAll<HTMLElement>("span:not([data-admin-header-email])").forEach((span) => {
        if (looksLikeEmail(span.textContent || "") || (span.textContent || "").trim()) span.remove();
      });
      utilities.querySelectorAll<HTMLButtonElement>("button:not([data-admin-header-signout])").forEach((button) => button.remove());

      utilities.style.display = "flex";
      utilities.style.alignItems = "center";
      utilities.style.justifyContent = "flex-end";
      utilities.style.gap = "24px";
      utilities.style.marginLeft = "auto";
      utilities.style.flexShrink = "0";

      const identity = Array.from(header.children).find((node) => node !== utilities && node instanceof HTMLElement) as HTMLElement | undefined;
      if (identity) {
        identity.style.display = "flex";
        identity.style.alignItems = "center";
        identity.style.gap = "28px";
        identity.style.minWidth = "0";
        identity.style.margin = "0";
      }

      const brand = identity?.querySelector<HTMLElement>("a, strong, [class*='brand']");
      if (brand) {
        brand.style.fontSize = "1.05rem";
        brand.style.fontWeight = "800";
        brand.style.lineHeight = "1";
        brand.style.whiteSpace = "nowrap";
        brand.style.textDecoration = "none";
        brand.style.color = "inherit";
      }

      const titleCandidates = identity
        ? Array.from(identity.querySelectorAll<HTMLElement>("h1, h2, span, p")).filter((node) => node !== brand && (node.textContent || "").trim())
        : [];
      const pageTitle = titleCandidates[0];
      if (pageTitle) {
        pageTitle.style.margin = "0";
        pageTitle.style.fontSize = ".98rem";
        pageTitle.style.fontWeight = "600";
        pageTitle.style.lineHeight = "1";
        pageTitle.style.color = "rgba(238,244,241,.68)";
        pageTitle.style.whiteSpace = "nowrap";
      }

      let email = utilities.querySelector<HTMLElement>("[data-admin-header-email='true']");
      if (adminEmail) {
        if (!email) {
          email = document.createElement("span");
          email.dataset.adminHeaderEmail = "true";
          utilities.appendChild(email);
        }
        email.textContent = adminEmail;
        email.style.whiteSpace = "nowrap";
        email.style.fontSize = ".86rem";
        email.style.fontWeight = "650";
        email.style.lineHeight = "1";
        email.style.color = "rgba(238,244,241,.78)";
      }

      let signOut = utilities.querySelector<HTMLButtonElement>("[data-admin-header-signout='true']");
      if (!signOut) {
        signOut = document.createElement("button");
        signOut.dataset.adminHeaderSignout = "true";
        signOut.type = "button";
        signOut.textContent = "Sign out";
        signOut.addEventListener("click", async () => {
          if (!signOut) return;
          signOut.disabled = true;
          signOut.textContent = "Signing out…";
          await supabase.auth.signOut();
          window.location.assign("/admin");
        });
        utilities.appendChild(signOut);
      }

      signOut.style.height = "40px";
      signOut.style.minHeight = "40px";
      signOut.style.padding = "0 16px";
      signOut.style.border = "1px solid rgba(45,212,191,.42)";
      signOut.style.borderRadius = "9px";
      signOut.style.background = "#18aaa5";
      signOut.style.color = "#ffffff";
      signOut.style.font = "inherit";
      signOut.style.fontSize = ".82rem";
      signOut.style.fontWeight = "800";
      signOut.style.lineHeight = "1";
      signOut.style.cursor = "pointer";
      signOut.style.whiteSpace = "nowrap";

      if (email && email.nextElementSibling !== signOut) utilities.insertBefore(email, signOut);
      if (signOut !== utilities.lastElementChild) utilities.appendChild(signOut);

      // Sales home keeps its existing hero relocation beneath the workspace tabs.
      if (window.location.pathname !== "/admin/sales") return;

      const title = header.querySelector<HTMLElement>("h1");
      const kicker = title?.previousElementSibling as HTMLElement | null;
      const subtitle = title?.nextElementSibling as HTMLElement | null;
      if (!title) return;
      if (kicker) kicker.style.display = "none";
      title.style.display = "none";
      if (subtitle) subtitle.style.display = "none";

      const tabsMount = document.querySelector<HTMLElement>("[data-admin-workspace-tabs='true']");
      if (!tabsMount?.parentElement) return;

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
