"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { browserSupabase as supabase } from "@/lib/supabase-browser";
import styles from "./guide.module.css";

type AccessState = "checking" | "signed_out" | "forbidden" | "ready";

type Stage = {
  number: string;
  phase: string;
  title: string;
  route: string;
  routeLabel: string;
  purpose: string;
  operator: string[];
  verify: string[];
  guardrail: string;
  handoff: string;
};

const stages: Stage[] = [
  {
    number: "01",
    phase: "Prospecting",
    title: "Discovery",
    route: "/admin/discovery",
    routeLabel: "Open Discovery",
    purpose: "Find strong new principal investigators and maintain a healthy production queue using the ChatGPT-native Engine v3 discovery workflow.",
    operator: [
      "Monitor the eligible queue and the 80-PI buffer.",
      "Review recent discovery runs, research-cluster rotation and candidate decisions when needed.",
      "Investigate held/rejected/duplicate decisions only when something looks wrong or strategically important.",
    ],
    verify: [
      "Independent, active PI at a real research group or institution.",
      "Official or authoritative identity evidence.",
      "At least four independently verified publications when required by the discovery gate.",
      "No duplicate prospect/site/Engine v3/discovery candidate.",
      "Trusted portrait readiness before admission.",
    ],
    guardrail: "Discovery may queue a prospect. It must not build a website, publish anything or send outreach.",
    handoff: "Accepted prospect → public.prospects status queued → Engine v3 Production.",
  },
  {
    number: "02",
    phase: "Production",
    title: "Engine v3 Production",
    route: "/admin/automation",
    routeLabel: "Open Production",
    purpose: "Turn queued PIs into evidence-backed, complete LabNarrative concept websites using the scheduled ChatGPT-native production workflow.",
    operator: [
      "Monitor producing, blocked and Final Review states.",
      "Use the production page for observability rather than manually bypassing the queue.",
      "Investigate genuine blocked states, portrait failures or renderer-contract problems.",
    ],
    verify: [
      "Research claims are grounded in verified evidence.",
      "Required research programmes are substantive and distinct.",
      "The complete LabSite renderer contract is present.",
      "PI portrait is correct, sharp, trusted and actually renders.",
      "The concept reaches deterministic verification before Final Review.",
    ],
    guardrail: "A successful Production run stops at Internal Final Review. Production never publishes or sends outreach.",
    handoff: "Verified concept → Engine v3 state final_review → Internal Final Review.",
  },
  {
    number: "03",
    phase: "Human gate",
    title: "Internal Final Review",
    route: "/admin/review",
    routeLabel: "Open Final Review",
    purpose: "Provide the human quality and publication gate between automated production and anything visible or commercial.",
    operator: [
      "Preview the real concept carefully.",
      "Check identity, portrait, science, copy, images, navigation and overall presentation.",
      "Approve & Publish only when the concept is genuinely suitable for outreach.",
      "Return for repair or block when required.",
    ],
    verify: [
      "Correct PI and institution.",
      "No fabricated or misleading scientific content.",
      "No broken visual elements or obvious renderer defects.",
      "Concept is credible enough to show the PI.",
    ],
    guardrail: "Publishing is a deliberate human action. Approval may prepare an outreach draft, but it must not send it.",
    handoff: "Approve & Publish → public concept available → outreach draft prepared.",
  },
  {
    number: "04",
    phase: "Quality control",
    title: "Website Monitor & Visual Editor",
    route: "/admin/sites",
    routeLabel: "Open Website Monitor",
    purpose: "Watch active LabNarrative sites for renderer, HTTP, portrait, public/private, outreach and visual problems and repair them through controlled revisions.",
    operator: [
      "Use Website Monitor to detect and classify problems.",
      "Open Edit/Fix when a site needs correction.",
      "Make changes in a private revision, preview them, validate, then publish deliberately.",
      "Use version history/restore if a published repair is wrong.",
    ],
    verify: [
      "Live HTTP health.",
      "Correct renderer/design version.",
      "Portrait and image rendering.",
      "Site content and route integrity.",
      "Revision preview before publish.",
    ],
    guardrail: "Detection never means automatic repair or automatic publication. Monitor → inspect → revision → preview → publish.",
    handoff: "Healthy published concept → Outreach.",
  },
  {
    number: "05",
    phase: "Acquisition",
    title: "Outreach",
    route: "/admin/sales",
    routeLabel: "Open Sales / Outreach",
    purpose: "Introduce the private website concept to the PI, manage follow-ups and correctly distinguish real human replies from automatic replies.",
    operator: [
      "Review the prepared outreach draft before sending.",
      "Send only through an explicit human action.",
      "Monitor delivery events, follow-ups, replies and LinkedIn work.",
      "Treat genuine human replies as the signal to stop the automated sequence and move into Sales.",
    ],
    verify: [
      "Correct recipient and academic salutation.",
      "Correct concept URL.",
      "Concise, relevant outreach copy.",
      "Human vs automatic reply classification.",
      "Delivery failures or sequence-stop conditions.",
    ],
    guardrail: "Never send real email or LinkedIn messages merely because a draft exists. Sending remains human-controlled.",
    handoff: "Human reply / engagement → individual Sales Lead Workspace.",
  },
  {
    number: "06",
    phase: "Conversion",
    title: "Sales Workspace",
    route: "/admin/sales",
    routeLabel: "Open Sales",
    purpose: "Turn interested PIs into clients while keeping meetings, replies, next actions, proposals, payments and delivery state in one operational pipeline.",
    operator: [
      "Start with the Daily Sales Action Queue.",
      "Open the PI-specific workspace for replies, notes, meetings and stage changes.",
      "Use the Reply Assistant as drafting support, then review the text yourself.",
      "Keep next actions and due dates current.",
    ],
    verify: [
      "Human reply context before responding.",
      "Correct sales stage.",
      "Meeting details and next action.",
      "Proposal/payment/onboarding/delivery state is consistent with reality.",
    ],
    guardrail: "Sales prioritizes work; it does not automatically send replies, schedule meetings or advance commercial stages without an explicit action.",
    handoff: "Interested / meeting completed → Proposal Builder.",
  },
  {
    number: "07",
    phase: "Agreement",
    title: "Proposal",
    route: "/admin/sales",
    routeLabel: "Open Sales then Proposal",
    purpose: "Define the commercial agreement clearly and provide the PI with a private proposal they can approve or decline.",
    operator: [
      "Set scope, deliverables, timeline, price, currency, deposit terms and validity.",
      "Preview the client-facing proposal before sharing.",
      "Prepare/share the private link and mark it sent when you actually send it.",
      "Treat the accepted proposal version as the commercial source of truth.",
    ],
    verify: [
      "Scope matches what was discussed.",
      "Pricing and deposit base/percentage are correct.",
      "Terms and validity are clear.",
      "Shared proposal has not been silently changed after the PI saw it.",
    ],
    guardrail: "Proposal approval records agreement to proceed. Approval itself never charges the client.",
    handoff: "Proposal accepted → immutable deposit request created.",
  },
  {
    number: "08",
    phase: "Commitment",
    title: "Deposit Payment",
    route: "/pay",
    routeLabel: "Open Payment Landing",
    purpose: "Collect the agreed project deposit securely using an amount derived from the accepted proposal rather than browser input.",
    operator: [
      "Share the private payment link generated for the accepted proposal.",
      "Monitor payment status from Sales.",
      "Use manual confirmation only for genuine out-of-band payments and only as an explicit admin action.",
    ],
    verify: [
      "Payment request amount and currency match the accepted proposal.",
      "Provider capture is completed and verified server-side.",
      "No browser-controlled amount can alter the request.",
    ],
    guardrail: "Never fake payment success. A provider payment is received only after verified completed capture for the exact stored amount/currency.",
    handoff: "Deposit received → Sales stage client → Client Onboarding opens.",
  },
  {
    number: "09",
    phase: "Client intake",
    title: "Client Onboarding",
    route: "/admin/sales",
    routeLabel: "Open Sales then Onboarding",
    purpose: "Collect the final corrections, assets and preferences needed to turn the concept into the client’s finished website without making them start from zero.",
    operator: [
      "Send the client their private onboarding link after deposit receipt.",
      "Monitor completion progress and submitted assets.",
      "Review identity, content, team, links, domain, branding, images, hiring and final notes.",
      "Approve the submission, apply accepted changes through the Visual Site Editor, then mark onboarding completed.",
    ],
    verify: [
      "Every onboarding section is reviewed/completed.",
      "Uploaded assets belong to the client and are appropriate for publication.",
      "Requested corrections are understood before editing the site.",
      "Domain preference is captured for launch planning.",
    ],
    guardrail: "Client onboarding never edits or publishes the website automatically. Accepted changes go through the controlled Site Editor revision workflow.",
    handoff: "Onboarding completed + changes applied → Client Final Review.",
  },
  {
    number: "10",
    phase: "Client approval",
    title: "Client Final Review",
    route: "/admin/sales",
    routeLabel: "Open Sales then Final Review",
    purpose: "Give the client a private, version-locked review of the finished website and obtain explicit approval before final payment and launch.",
    operator: [
      "Prepare the final review only after onboarding changes are applied.",
      "Send the private review link and mark it sent.",
      "If the PI requests changes, edit the site and prepare a new review version.",
      "Monitor approval and the resulting final-balance request.",
    ],
    verify: [
      "Review link points to the exact intended website revision.",
      "Website has not changed after review preparation.",
      "Requested changes are resolved before a replacement review is sent.",
    ],
    guardrail: "A stale review cannot approve a newer/different website. Client approval creates the balance request but does not charge it.",
    handoff: "Client approves final website → final balance becomes due.",
  },
  {
    number: "11",
    phase: "Completion payment",
    title: "Final Balance",
    route: "/admin/sales",
    routeLabel: "Open Sales / Payment",
    purpose: "Collect the remaining project balance after the client explicitly approves the finished website.",
    operator: [
      "Monitor the final balance request and provider status.",
      "Follow up if payment becomes overdue.",
      "Confirm that a manual balance payment, if ever used, creates the same delivery state as provider payment.",
    ],
    verify: [
      "Balance = accepted proposal amount minus recorded paid deposit.",
      "Exact amount/currency verified server-side.",
      "Workspace reaches Paid in full only after real payment confirmation.",
    ],
    guardrail: "Do not launch simply because the client approved the site. Final payment and launch gates are separate checkpoints.",
    handoff: "Paid in full → Launch Workspace.",
  },
  {
    number: "12",
    phase: "Delivery",
    title: "Launch Workspace",
    route: "/admin/sales",
    routeLabel: "Open Sales then Launch",
    purpose: "Perform the final technical and operational checks before deliberately making the client website live.",
    operator: [
      "Complete the launch checklist: domain, HTTPS, health, mobile, links, analytics and branding.",
      "Confirm client approval and paid-in-full state are still valid.",
      "Use the deliberate Launch website action only when all gates are complete.",
    ],
    verify: [
      "The site still matches the version approved by the client.",
      "Domain and HTTPS are genuinely ready.",
      "Website health and mobile presentation are acceptable.",
      "Contact/social/external links and final branding are correct.",
    ],
    guardrail: "Launch is never automatic. If the website changed after client approval, obtain a fresh client review first.",
    handoff: "Launch website → live site + launch record → private Client Handover becomes available.",
  },
  {
    number: "13",
    phase: "Closeout",
    title: "Client Handover",
    route: "/admin/sales",
    routeLabel: "Open Sales then Launch/Handover",
    purpose: "Deliver the final live website formally and give the client a clear completion record, live URL and support path.",
    operator: [
      "Open/check the client handover page.",
      "Send the private handover link and mark it sent.",
      "Monitor acknowledgement.",
      "Keep support instructions clear and accurate.",
    ],
    verify: [
      "Correct live URL/domain.",
      "Launch date and paid-in-full record are correct.",
      "Client has received the final website and support information.",
    ],
    guardrail: "Handover acknowledgement records receipt of delivery; it must not silently create a new commercial commitment.",
    handoff: "Handover acknowledged → LabNarrative Care offer becomes the post-delivery path.",
  },
  {
    number: "14",
    phase: "Retention",
    title: "LabNarrative Care",
    route: "/admin/care",
    routeLabel: "Open Care",
    purpose: "Turn completed projects into an ongoing support relationship through included Care entitlements or optional recurring maintenance subscriptions.",
    operator: [
      "Monitor active/included Care clients, MRR/ARR, subscription health and open update requests.",
      "Manage future Care plan settings without altering accepted existing subscription snapshots.",
      "Review, schedule and complete client maintenance requests.",
      "Resolve failed/suspended recurring payments and cancellations when needed.",
    ],
    verify: [
      "Care entitlement or subscription status is real and provider-synchronized.",
      "Recurring-payment webhooks are healthy for standalone subscriptions.",
      "Maintenance requests are tracked to completion.",
      "Project-included Care is not charged a second time.",
    ],
    guardrail: "Do not infer an active paid subscription from page activity. Recurring subscription/payment state must come from the provider or a legitimate included entitlement.",
    handoff: "Active Care client → ongoing monitoring, content updates and long-term retention.",
  },
];

const goldenRules = [
  "Supabase live state and the current GitHub main branch are the operational source of truth.",
  "Discovery and Production are ChatGPT-native Engine v3 workflows; do not revive retired autonomous/API-credit workers.",
  "Production stops at Internal Final Review.",
  "Publishing is human-controlled.",
  "Outreach sending is human-controlled.",
  "Proposal approval does not charge the client.",
  "Payments count only after server-side provider verification or an explicit legitimate manual confirmation.",
  "Onboarding never publishes the website.",
  "Client final approval is tied to the exact reviewed website revision.",
  "Launch is a deliberate admin action after approval, payment and operational checks.",
  "Care subscriptions and recurring payments are provider-verified; included Care must not create a duplicate charge.",
];

export default function AdminGuidePage() {
  const [access, setAccess] = useState<AccessState>("checking");

  useEffect(() => {
    let active = true;
    async function check() {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;
      if (!active) return;
      if (!session) {
        setAccess("signed_out");
        return;
      }
      const { data: roleRow, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id)
        .maybeSingle();
      if (!active) return;
      setAccess(!error && roleRow?.role === "admin" ? "ready" : "forbidden");
    }
    void check();
    const { data: listener } = supabase.auth.onAuthStateChange(() => void check());
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  if (access !== "ready") {
    return (
      <main className={styles.accessPage}>
        <section className={styles.accessCard}>
          <div className={styles.wordmark}><span>Lab</span>Narrative</div>
          <p className={styles.eyebrow}>Private administrator guide</p>
          <h1>{access === "checking" ? "Checking administrator access…" : access === "signed_out" ? "Administrator sign-in required." : "Administrator permission required."}</h1>
          <p>This operating guide is part of the private LabNarrative platform.</p>
          {access !== "checking" ? <Link href="/admin">Go to administrator sign-in →</Link> : null}
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div>
            <div className={styles.wordmark}><span>Lab</span>Narrative</div>
            <p className={styles.eyebrow}>Private operating manual</p>
            <h1>From discovery to long-term client care.</h1>
            <p className={styles.lead}>A practical guide to running the full LabNarrative lifecycle without losing the human checkpoints that protect scientific quality, client trust and payment integrity.</p>
          </div>
          <nav className={styles.topNav}>
            <Link href="/admin">Admin</Link>
            <Link href="/admin/sales">Sales</Link>
            <Link href="/admin/sites">Websites</Link>
            <Link href="/admin/care">Care</Link>
          </nav>
        </header>

        <section className={styles.flow} aria-label="LabNarrative lifecycle">
          {stages.map((stage, index) => (
            <a key={stage.number} href={`#stage-${stage.number}`}>
              <span>{stage.number}</span>
              <strong>{stage.title}</strong>
              {index < stages.length - 1 ? <small>→</small> : null}
            </a>
          ))}
        </section>

        <section className={styles.rules}>
          <div>
            <p className={styles.eyebrow}>Golden rules</p>
            <h2>The control points that should not be bypassed.</h2>
          </div>
          <ol>
            {goldenRules.map((rule) => <li key={rule}>{rule}</li>)}
          </ol>
        </section>

        <section className={styles.quickStart}>
          <div>
            <p className={styles.eyebrow}>Daily operating rhythm</p>
            <h2>Where to begin when you open LabNarrative.</h2>
          </div>
          <div className={styles.quickGrid}>
            <article><span>01</span><h3>Sales actions first</h3><p>Check human replies, meetings, proposals, payment follow-ups and client-delivery actions that are due now.</p><Link href="/admin/sales">Open Sales →</Link></article>
            <article><span>02</span><h3>Final Review</h3><p>Review completed Engine v3 concepts waiting for your publication decision.</p><Link href="/admin/review">Open Final Review →</Link></article>
            <article><span>03</span><h3>Site health</h3><p>Check the Website Monitor for live HTTP, portrait, renderer and visual problems.</p><Link href="/admin/sites">Open Websites →</Link></article>
            <article><span>04</span><h3>Care requests</h3><p>Process maintenance requests and check recurring/included Care client health.</p><Link href="/admin/care">Open Care →</Link></article>
          </div>
        </section>

        <section className={styles.stages}>
          {stages.map((stage) => (
            <article className={styles.stage} id={`stage-${stage.number}`} key={stage.number}>
              <div className={styles.stageIndex}>
                <span>{stage.number}</span>
                <small>{stage.phase}</small>
              </div>
              <div className={styles.stageBody}>
                <div className={styles.stageTitle}>
                  <div>
                    <h2>{stage.title}</h2>
                    <p>{stage.purpose}</p>
                  </div>
                  <Link href={stage.route}>{stage.routeLabel} ↗</Link>
                </div>
                <div className={styles.stageGrid}>
                  <section>
                    <h3>What you do</h3>
                    <ul>{stage.operator.map(item => <li key={item}>{item}</li>)}</ul>
                  </section>
                  <section>
                    <h3>Verify before moving on</h3>
                    <ul>{stage.verify.map(item => <li key={item}>{item}</li>)}</ul>
                  </section>
                </div>
                <div className={styles.guardrail}><span>Guardrail</span><p>{stage.guardrail}</p></div>
                <div className={styles.handoff}><span>Next handoff</span><p>{stage.handoff}</p></div>
              </div>
            </article>
          ))}
        </section>

        <section className={styles.emergency}>
          <div>
            <p className={styles.eyebrow}>When something looks wrong</p>
            <h2>Do not repair state by guessing.</h2>
          </div>
          <div>
            <p>First inspect the live Supabase records and the current GitHub implementation. Determine which stage owns the state transition, then repair through the existing admin action/RPC whenever possible.</p>
            <p>Prefer hold, block, return-for-repair or a reversible site revision over destructive deletion. For money, email, publishing and launch actions, fail closed.</p>
          </div>
        </section>

        <footer className={styles.footer}>
          <div className={styles.wordmark}><span>Lab</span>Narrative</div>
          <span>Private administrator operating guide</span>
          <a href="#top" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>Back to top ↑</a>
        </footer>
      </div>
    </main>
  );
}
