"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { browserSupabase as supabase } from "@/lib/supabase-browser";

const RECOVERY_KEY = "labnarrative-admin-recovery-attempted";
const LEGACY_PLATFORM_ORIGIN = "https://platform.labnarrative.com";

function requiresPrimaryAdminSession(pathname: string) {
  return (
    pathname === "/admin/systems" ||
    pathname.startsWith("/admin/systems/") ||
    pathname === "/admin/systems-outreach" ||
    pathname.startsWith("/admin/websites/") ||
    pathname === "/admin/sites" ||
    pathname.startsWith("/admin/sites/") ||
    pathname.startsWith("/admin/sites-v") ||
    pathname.startsWith("/admin/discovery") ||
    pathname.startsWith("/admin/review") ||
    pathname.startsWith("/admin/sales") ||
    pathname.startsWith("/admin/linkedin") ||
    pathname.startsWith("/admin/outreach") ||
    pathname.startsWith("/admin/care")
  );
}

function currentReturnTo() {
  return `${window.location.pathname}${window.location.search}`;
}

export default function AdminSessionContinuity() {
  const pathname = usePathname();

  useEffect(() => {
    if (!requiresPrimaryAdminSession(pathname)) return;
    if (window.location.hostname !== "labnarrative.com" && window.location.hostname !== "www.labnarrative.com") return;

    let active = true;

    const recover = async () => {
      const { data } = await supabase.auth.getSession();
      if (!active) return;

      if (data.session) {
        window.sessionStorage.removeItem(RECOVERY_KEY);
        return;
      }

      if (window.sessionStorage.getItem(RECOVERY_KEY) === "1") return;
      window.sessionStorage.setItem(RECOVERY_KEY, "1");

      const transfer = new URL("/admin/session-transfer", LEGACY_PLATFORM_ORIGIN);
      transfer.searchParams.set("return_to", currentReturnTo());
      window.location.replace(transfer.toString());
    };

    void recover();

    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (session) {
        window.sessionStorage.removeItem(RECOVERY_KEY);
        return;
      }
      if (event === "SIGNED_OUT") void recover();
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [pathname]);

  return null;
}
