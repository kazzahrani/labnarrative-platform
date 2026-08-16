"use client";

import { createClient, type Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import styles from "./systems-contact-search.module.css";

type Prospect = {
  id: string;
  company_name: string;
  status: string;
};

type Contact = {
  id: string;
  prospect_id: string;
  name: string;
  title: string;
  linkedin_url: string | null;
  email: string | null;
  priority: number;
  is_current_verified: boolean;
};

type ContactResult = Contact & {
  company_name: string;
  company_status: string;
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
);

const validPaths = new Set(["/admin/systems", "/admin/systems/acquire", "/admin/systems-outreach"]);

function findMainSearchInput() {
  return Array.from(document.querySelectorAll<HTMLInputElement>("input")).find((input) =>
    (input.placeholder || "").toLowerCase().startsWith("search company"),
  ) ?? null;
}

function findAllFilterButton() {
  return Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find((button) => {
    if (button.textContent?.trim() !== "All") return false;
    const parent = button.parentElement;
    if (!parent) return false;
    const labels = Array.from(parent.querySelectorAll("button")).map((item) => item.textContent?.trim());
    return labels.includes("Ready to send") && labels.includes("Contacted");
  }) ?? null;
}

function setControlledInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function clickCompanyRow(companyName: string) {
  const normalized = companyName.trim().toLowerCase();
  const rows = Array.from(document.querySelectorAll<HTMLTableRowElement>("table tbody tr"));
  const row = rows.find((candidate) => {
    const firstCell = candidate.querySelector("td");
    if (!firstCell) return false;
    const primary = firstCell.querySelector("strong, span")?.textContent?.trim().toLowerCase() ?? "";
    if (primary === normalized) return true;
    const full = firstCell.textContent?.trim().toLowerCase() ?? "";
    return full === normalized || full.startsWith(`${normalized}\n`);
  });
  row?.click();
  return Boolean(row);
}

function focusContactRow(contactName: string) {
  const normalized = contactName.trim().toLowerCase();
  const scope = document.querySelector<HTMLElement>('[data-systems-simple-outreach-host="true"]') ?? document.querySelector<HTMLElement>("main aside");
  if (!scope) return false;

  const row = Array.from(scope.querySelectorAll<HTMLTableRowElement>("table tbody tr")).find((candidate) => {
    const name = candidate.querySelector("td strong")?.textContent?.trim().toLowerCase() ?? "";
    return name === normalized;
  });
  if (!row) return false;

  row.scrollIntoView({ behavior: "smooth", block: "center" });
  const previousBackground = row.style.background;
  const previousBoxShadow = row.style.boxShadow;
  row.style.background = "rgba(53, 199, 193, 0.10)";
  row.style.boxShadow = "inset 3px 0 0 rgba(53, 199, 193, 0.95)";
  window.setTimeout(() => {
    row.style.background = previousBackground;
    row.style.boxShadow = previousBoxShadow;
  }, 2400);
  return true;
}

export default function SystemsContactSearchEnhancer() {
  const pathname = usePathname();
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [query, setQuery] = useState("");
  const [mount, setMount] = useState<HTMLElement | null>(null);

  const load = useCallback(async (activeSession: Session) => {
    const { data: role } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", activeSession.user.id)
      .maybeSingle();

    if (role?.role !== "admin") {
      setIsAdmin(false);
      return;
    }

    setIsAdmin(true);
    const [prospectResult, contactResult] = await Promise.all([
      supabase
        .from("systems_outreach_prospects")
        .select("id,company_name,status")
        .order("fit_score", { ascending: false }),
      supabase
        .from("systems_outreach_contacts")
        .select("id,prospect_id,name,title,linkedin_url,email,priority,is_current_verified")
        .order("priority", { ascending: true }),
    ]);

    if (!prospectResult.error) setProspects((prospectResult.data ?? []) as Prospect[]);
    if (!contactResult.error) setContacts((contactResult.data ?? []) as Contact[]);
  }, []);

  useEffect(() => {
    if (!validPaths.has(pathname)) return;

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) void load(data.session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (next) void load(next);
      else {
        setIsAdmin(false);
        setProspects([]);
        setContacts([]);
      }
    });

    return () => subscription.unsubscribe();
  }, [pathname, load]);

  useEffect(() => {
    if (!validPaths.has(pathname) || !session || !isAdmin) return;

    let input: HTMLInputElement | null = null;
    let host: HTMLDivElement | null = null;
    let observer: MutationObserver | null = null;
    let cleanupInput: (() => void) | null = null;

    const attach = () => {
      const nextInput = findMainSearchInput();
      if (!nextInput || nextInput === input) return;

      cleanupInput?.();
      host?.remove();
      input = nextInput;
      input.placeholder = "Search company or contact name…";

      host = document.createElement("div");
      host.dataset.systemsContactSearch = "true";
      input.insertAdjacentElement("afterend", host);
      setMount(host);

      const onInput = () => setQuery(input?.value ?? "");
      const onFocus = () => setQuery(input?.value ?? "");
      input.addEventListener("input", onInput);
      input.addEventListener("focus", onFocus);
      cleanupInput = () => {
        input?.removeEventListener("input", onInput);
        input?.removeEventListener("focus", onFocus);
      };
      setQuery(input.value);
    };

    attach();
    observer = new MutationObserver(attach);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer?.disconnect();
      cleanupInput?.();
      host?.remove();
      setMount(null);
      setQuery("");
    };
  }, [pathname, session, isAdmin]);

  const results = useMemo<ContactResult[]>(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];

    const companyById = new Map(prospects.map((prospect) => [prospect.id, prospect]));
    return contacts
      .filter((contact) => {
        const haystack = [contact.name, contact.title, contact.email ?? ""].join(" ").toLowerCase();
        return haystack.includes(q);
      })
      .map((contact) => {
        const company = companyById.get(contact.prospect_id);
        if (!company) return null;
        return {
          ...contact,
          company_name: company.company_name,
          company_status: company.status,
        };
      })
      .filter((item): item is ContactResult => Boolean(item))
      .sort((a, b) => {
        const aName = a.name.toLowerCase();
        const bName = b.name.toLowerCase();
        const aStarts = aName.startsWith(q) ? 0 : 1;
        const bStarts = bName.startsWith(q) ? 0 : 1;
        return aStarts - bStarts || a.company_name.localeCompare(b.company_name) || a.priority - b.priority;
      })
      .slice(0, 10);
  }, [query, prospects, contacts]);

  const openCompany = (result: ContactResult) => {
    const input = findMainSearchInput();
    if (!input) return;

    // Contact lookup must work regardless of the status filter currently selected.
    findAllFilterButton()?.click();

    const openAndFocus = (attempt = 0) => {
      setControlledInputValue(input, result.company_name);
      setQuery("");

      window.setTimeout(() => {
        const opened = clickCompanyRow(result.company_name);
        if (!opened && attempt < 4) {
          openAndFocus(attempt + 1);
          return;
        }
        if (!opened) return;

        // The right-hand company panel is rendered just after the company selection changes.
        const focus = (focusAttempt = 0) => {
          if (focusContactRow(result.name)) return;
          if (focusAttempt < 8) window.setTimeout(() => focus(focusAttempt + 1), 120);
        };
        window.setTimeout(() => focus(), 80);
      }, attempt === 0 ? 80 : 140);
    };

    window.setTimeout(() => openAndFocus(), 40);
  };

  if (!mount || !validPaths.has(pathname) || !session || !isAdmin || results.length === 0) return null;

  return createPortal(
    <div className={styles.results}>
      <div className={styles.head}>
        <span>Contact matches</span>
        <strong>{results.length}</strong>
      </div>
      {results.map((result) => (
        <div className={styles.result} key={result.id}>
          <button className={styles.openCompany} type="button" onClick={() => openCompany(result)}>
            <span className={styles.person}>
              <strong>{result.name}</strong>
              <small>{result.title}</small>
            </span>
            <span className={styles.companyBlock}>
              <span>{result.company_name}</span>
              <small>{result.company_status.replaceAll("_", " ")}</small>
            </span>
            <span className={styles.arrow}>Open company →</span>
          </button>
          <div className={styles.channels}>
            {result.linkedin_url ? (
              <a href={result.linkedin_url} target="_blank" rel="noreferrer">LinkedIn ↗</a>
            ) : (
              <span>No LinkedIn</span>
            )}
            {result.email ? <span>{result.email}</span> : null}
          </div>
        </div>
      ))}
    </div>,
    mount,
  );
}
