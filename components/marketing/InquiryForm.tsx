"use client";

import { createClient } from "@supabase/supabase-js";
import { FormEvent, useState } from "react";
import styles from "./marketing.module.css";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
);

type State = "idle" | "submitting" | "success" | "error";

function value(form: FormData, key: string) {
  return String(form.get(key) ?? "").trim();
}

export default function InquiryForm() {
  const [state, setState] = useState<State>("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state === "submitting") return;

    const formElement = event.currentTarget;
    const form = new FormData(formElement);

    if (value(form, "company")) {
      setState("success");
      return;
    }

    setState("submitting");
    setMessage("");

    const payload = {
      name: value(form, "name"),
      email: value(form, "email"),
      institution: value(form, "institution"),
      profile_url: value(form, "profile_url"),
      current_website: value(form, "current_website"),
      package_interest: value(form, "package_interest"),
      desired_domain: value(form, "desired_domain"),
      goals: value(form, "goals"),
      launch_timeline: value(form, "launch_timeline"),
    };

    const { error } = await supabase.from("inquiries").insert(payload);

    if (error) {
      setState("error");
      setMessage("The form could not be sent. Please email hello@labnarrative.com.");
      return;
    }

    formElement.reset();
    setState("success");
    setMessage("Thank you. Your laboratory profile has been received.");
  }

  return (
    <form className={styles.inquiryForm} onSubmit={handleSubmit}>
      <div className={styles.formGrid}>
        <label>
          Your name
          <input name="name" autoComplete="name" required />
        </label>
        <label>
          Email
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <label>
          Institution
          <input name="institution" autoComplete="organization" />
        </label>
        <label>
          Official profile URL
          <input name="profile_url" type="url" placeholder="https://" />
        </label>
        <label>
          Current website
          <input name="current_website" type="url" placeholder="https://" />
        </label>
        <label>
          Package
          <select name="package_interest" defaultValue="Professional">
            <option>Professional</option>
            <option>Essential</option>
            <option>Not sure yet</option>
          </select>
        </label>
        <label>
          Preferred domain
          <input name="desired_domain" placeholder="yourlab.org" />
        </label>
        <label>
          Target launch
          <select name="launch_timeline" defaultValue="No fixed date">
            <option>No fixed date</option>
            <option>Within 2 weeks</option>
            <option>Within 1 month</option>
            <option>Within 3 months</option>
          </select>
        </label>
      </div>

      <label>
        What should the new website communicate?
        <textarea
          name="goals"
          rows={6}
          placeholder="Research priorities, audience, current problems, preferred visual direction..."
        />
      </label>

      <label className={styles.honeypot} aria-hidden="true">
        Company
        <input name="company" tabIndex={-1} autoComplete="off" />
      </label>

      <div className={styles.formSubmitRow}>
        <button type="submit" disabled={state === "submitting"}>
          {state === "submitting" ? "Sending…" : "Submit laboratory profile"}
        </button>
        <p>
          By submitting, you agree that LabNarrative may use these details to respond to your
          enquiry.
        </p>
      </div>

      {message ? (
        <p className={state === "error" ? styles.formError : styles.formSuccess} role="status">
          {message}
        </p>
      ) : null}
    </form>
  );
}
