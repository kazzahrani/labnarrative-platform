"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { browserSupabase as supabase } from "@/lib/supabase-browser";
import styles from "./sales-onboarding-launcher.module.css";

type Onboarding = {
  share_token: string;
  status: string;
  identity_reviewed: boolean;
  content_reviewed: boolean;
  team_reviewed: boolean;
  contact_reviewed: boolean;
  domain_reviewed: boolean;
  branding_reviewed: boolean;
  hiring_reviewed: boolean;
};

type ResponseData = {
  onboarding?: Onboarding | null;
  progress?: number;
};

function label(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function SalesOnboardingLauncher({ prospectId }: { prospectId: string }) {
  const [onboarding, setOnboarding] = useState<Onboarding | null>(null);
  const [progress, setProgress] = useState(0);
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("sales_client_onboarding_admin_get", { p_prospect_id: prospectId });
    if (!error && data && typeof data === "object") {
      const next = data as ResponseData;
      setOnboarding(next.onboarding || null);
      setProgress(Number(next.progress || 0) || 0);
    }
  }, [prospectId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!prospectId || !onboarding) return;
    const channel = supabase
      .channel(`sales-onboarding-${prospectId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "sales_client_onboarding", filter: `prospect_id=eq.${prospectId}` }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load, onboarding, prospectId]);

  if (!onboarding) return null;

  const clientUrl = `https://labnarrative.com/onboarding/${onboarding.share_token}`;
  const submitted = ["submitted", "reviewing", "approved", "completed"].includes(onboarding.status);

  async function copyClientLink() {
    await navigator.clipboard.writeText(clientUrl);
    setNotice("Client link copied.");
    window.setTimeout(() => setNotice(""), 1800);
  }

  return (
    <div className={styles.wrap}>
      {open ? (
        <section className={styles.panel}>
          <header>
            <div>
              <span>Client onboarding</span>
              <strong>{label(onboarding.status)}</strong>
            </div>
            <button type="button" onClick={() => setOpen(false)}>×</button>
          </header>
          <div className={styles.progressRow}>
            <div className={styles.track}><div className={styles.fill} style={{ width: `${progress}%` }} /></div>
            <strong>{progress}%</strong>
          </div>
          <p>{submitted ? "The client has moved into the review stage." : "Share the private onboarding link after the deposit is received."}</p>
          <div className={styles.actions}>
            <Link href={`/admin/sales/${prospectId}/onboarding`}>Review</Link>
            <button type="button" onClick={() => void copyClientLink()}>Copy client link</button>
          </div>
          {notice ? <small>{notice}</small> : null}
        </section>
      ) : null}
      <button className={`${styles.launcher} ${submitted ? styles.launcherAttention : ""}`} type="button" onClick={() => setOpen((value) => !value)}>
        <span>Onboarding</span>
        <strong>{progress}% · {label(onboarding.status)} →</strong>
      </button>
    </div>
  );
}
