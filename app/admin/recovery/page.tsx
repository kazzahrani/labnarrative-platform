"use client";

import { createClient } from "@supabase/supabase-js";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

export default function AdminRecoveryPage() {
  const searchParams = useSearchParams();
  const [message, setMessage] = useState("Verifying the one-time administrator link…");
  const supabase = useMemo(
    () => createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    ),
    [],
  );

  useEffect(() => {
    const tokenHash = searchParams.get("token_hash");
    const type = searchParams.get("type") === "recovery" ? "recovery" : "magiclink";

    if (!tokenHash) {
      setMessage("This recovery link is incomplete. Please request a new one.");
      return;
    }

    let cancelled = false;

    async function verify() {
      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type,
      });

      if (cancelled) return;

      if (error) {
        setMessage(`This recovery link could not be used: ${error.message}`);
        return;
      }

      setMessage("Administrator access restored. Redirecting…");
      window.location.replace("/admin");
    }

    void verify();
    return () => {
      cancelled = true;
    };
  }, [searchParams, supabase]);

  return (
    <main className="admin-loading">
      <p>{message}</p>
    </main>
  );
}
