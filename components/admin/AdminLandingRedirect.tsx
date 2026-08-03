"use client";

import { createClient } from "@supabase/supabase-js";
import { useEffect } from "react";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export default function AdminLandingRedirect() {
  useEffect(() => {
    if (window.location.pathname !== "/admin") return;

    const params = new URLSearchParams(window.location.search);
    if (params.has("site") || params.size > 0) return;

    let active = true;

    const openMonitor = () => {
      if (active && window.location.pathname === "/admin") {
        window.location.replace("/admin/sites");
      }
    };

    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) openMonitor();
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) openMonitor();
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  return null;
}
