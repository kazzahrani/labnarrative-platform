"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

type WealthLanguage = "ar" | "en";

type NavItem = {
  href: string;
  ar: string;
  en: string;
  active: (pathname: string) => boolean;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/wealth", ar: "نظرة عامة", en: "Overview", active: (p) => p === "/wealth" },
  { href: "/wealth/assets", ar: "الأصول", en: "Assets", active: (p) => p.startsWith("/wealth/assets") },
  { href: "/wealth/income", ar: "الدخل", en: "Income", active: (p) => p.startsWith("/wealth/income") },
  { href: "/wealth/analytics", ar: "التحليلات", en: "Analytics", active: (p) => p.startsWith("/wealth/analytics") },
  { href: "/wealth/shariah", ar: "الالتزام الشرعي", en: "Shariah", active: (p) => p.startsWith("/wealth/shariah") },
];

function isAppRoute(pathname: string) {
  if (!pathname.startsWith("/wealth")) return false;
  if (pathname.startsWith("/wealth/login")) return false;
  if (pathname.startsWith("/wealth/reset-password")) return false;
  if (pathname.startsWith("/wealth/connect")) return false;
  return true;
}

export default function WealthGlobalSidebar() {
  const pathname = usePathname();
  const [language, setLanguage] = useState<WealthLanguage>("ar");
  const [paper, setPaper] = useState(false);

  const visible = isAppRoute(pathname);

  useEffect(() => {
    const readLanguage = () => {
      const next = document.documentElement.dataset.wealthLang === "en" ? "en" : "ar";
      setLanguage(next);
    };

    readLanguage();
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ language?: WealthLanguage }>).detail;
      setLanguage(detail?.language === "en" ? "en" : "ar");
    };
    window.addEventListener("wealth:language-change", handler);
    return () => window.removeEventListener("wealth:language-change", handler);
  }, []);

  useEffect(() => {
    if (!visible) {
      document.documentElement.classList.remove("wealth-global-sidebar-active");
      return;
    }
    document.documentElement.classList.add("wealth-global-sidebar-active");
    setPaper(new URLSearchParams(window.location.search).get("portfolio") === "paper");
    return () => document.documentElement.classList.remove("wealth-global-sidebar-active");
  }, [pathname, visible]);

  if (!visible) return null;

  const suffix = paper ? "?portfolio=paper" : "";

  return (
    <aside className="wealth-global-sidebar" data-global-wealth-sidebar="true" dir={language === "en" ? "ltr" : "rtl"}>
      <div className="wealth-global-brand">
        <div className="wealth-global-brand-line">
          <img className="wealth-brand-mark" src="/tharwa-logo-light.svg" alt="" />
          <strong>{language === "en" ? "Thrwa" : "ثروة"}</strong>
        </div>
        <span>{language === "en" ? "Wealth management" : "إدارة الثروة"}</span>
      </div>

      <nav className="wealth-global-nav" aria-label={language === "en" ? "Wealth sections" : "أقسام ثروة"}>
        {NAV_ITEMS.map((item) => {
          const selected = item.active(pathname);
          return (
            <a
              key={item.href}
              href={`${item.href}${suffix}`}
              className={`wealth-global-nav-item${selected ? " is-active" : ""}`}
              aria-current={selected ? "page" : undefined}
            >
              {language === "en" ? item.en : item.ar}
            </a>
          );
        })}
      </nav>
    </aside>
  );
}
