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
    pathname === "/admin/websites" ||
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
    let recovering = false;

    const transferToAdminSession = () => {
      if (!active || recovering) return;
      if (window.sessionStorage.getItem(RECOVERY_KEY) === "1") return;
      recovering = true;
      window.sessionStorage.setItem(RECOVERY_KEY, "1");

      const transfer = new URL("/admin/session-transfer", LEGACY_PLATFORM_ORIGIN);
      transfer.searchParams.set("return_to", currentReturnTo());
      window.location.replace(transfer.toString());
    };

    const recover = async () => {
      if (!active || recovering) return;

      const { data, error } = await supabase.auth.getSession();
      if (!active || recovering) return;
      const session = data.session;

      if (error || !session) {
        transferToAdminSession();
        return;
      }

      const { data: roleRow, error: roleError } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (!active || recovering) return;

      if (!roleError && roleRow?.role === "admin") {
        window.sessionStorage.removeItem(RECOVERY_KEY);
        return;
      }

      // A valid non-admin session (for example an Intelligence client login)
      // must never satisfy an administrator route. Clear only this browser
      // session, then restore the dedicated admin session from the legacy
      // admin origin or fall back to the normal admin sign-in flow.
      await supabase.auth.signOut({ scope: "local" });
      if (!active || recovering) return;
      transferToAdminSession();
    };

    void recover();

    const { data: subscription } = supabase.auth.onAuthStateChange(() => {
      if (!active || recovering) return;
      // Run outside the auth callback so getSession/signOut never contend with
      // the auth client's own state-change lock.
      window.setTimeout(() => void recover(), 0);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [pathname]);

  return null;
}
