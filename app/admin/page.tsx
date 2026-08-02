"use client";

import { createClient, type Session } from "@supabase/supabase-js";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type SiteStatus = "draft" | "concept" | "live" | "archived";

type Project = { title: string; description: string };
type TeamMember = { name: string; role: string };
type Publication = { title: string; journal: string; year: string; href?: string };

type SiteContent = {
  slug: string;
  piName: string;
  labName: string;
  title: string;
  institution: string;
  eyebrow: string;
  headline: string;
  introduction: string;
  focusAreas: string[];
  projects: Project[];
  team: TeamMember[];
  publications: Publication[];
  theme: {
    background: string;
    surface: string;
    foreground: string;
    muted: string;
    accent: string;
  };
  [key: string]: unknown;
};

type SiteRow = {
  id: string;
  slug: string;
  status: SiteStatus;
  content: SiteContent;
  updated_at: string;
};

type EditorState = {
  id?: string;
  status: SiteStatus;
  content: SiteContent;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const emptyContent = (): SiteContent => ({
  slug: "",
  piName: "",
  labName: "",
  title: "",
  institution: "",
  eyebrow: "",
  headline: "",
  introduction: "",
  focusAreas: [""],
  projects: [{ title: "", description: "" }],
  team: [{ name: "", role: "Principal Investigator" }],
  publications: [{ title: "", journal: "", year: "", href: "" }],
  theme: {
    background: "#eef1eb",
    surface: "#f8faf6",
    foreground: "#153229",
    muted: "#64726c",
    accent: "#1b5a45",
  },
});

function cleanSlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function compactContent(content: SiteContent): SiteContent {
  return {
    ...content,
    slug: cleanSlug(content.slug),
    focusAreas: content.focusAreas.map((item) => item.trim()).filter(Boolean),
    projects: content.projects
      .map((item) => ({ title: item.title.trim(), description: item.description.trim() }))
      .filter((item) => item.title || item.description),
    team: content.team
      .map((item) => ({ name: item.name.trim(), role: item.role.trim() }))
      .filter((item) => item.name || item.role),
    publications: content.publications
      .map((item) => ({
        title: item.title.trim(),
        journal: item.journal.trim(),
        year: item.year.trim(),
        href: item.href?.trim() || undefined,
      }))
      .filter((item) => item.title || item.journal || item.year),
  };
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="admin-field">
      <span>{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required={required}
      />
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
  placeholder,
  rows = 4,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <label className="admin-field admin-field-wide">
      <span>{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={rows}
      />
    </label>
  );
}

export default function AdminPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [email, setEmail] = useState("hello@labnarrative.com");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [notice, setNotice] = useState("");
  const [role, setRole] = useState<string | null>(null);
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [editor, setEditor] = useState<EditorState>({
    status: "draft",
    content: emptyContent(),
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const selectedSite = useMemo(
    () => sites.find((site) => site.id === editor.id),
    [sites, editor.id],
  );

  const loadAdminData = useCallback(async (activeSession: Session) => {
    setLoading(true);
    setNotice("");

    const { data: roleRow, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", activeSession.user.id)
      .maybeSingle();

    if (roleError) {
      setNotice(roleError.message);
      setRole(null);
      setLoading(false);
      return;
    }

    if (roleRow?.role !== "admin") {
      setRole(roleRow?.role ?? null);
      setNotice("This account does not have LabNarrative administrator access.");
      setLoading(false);
      return;
    }

    setRole("admin");

    const { data, error } = await supabase
      .from("sites")
      .select("id,slug,status,content,updated_at")
      .order("slug", { ascending: true });

    if (error) {
      setNotice(error.message);
    } else {
      setSites((data ?? []) as SiteRow[]);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
      if (data.session) void loadAdminData(data.session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthReady(true);
      if (nextSession) {
        void loadAdminData(nextSession);
      } else {
        setRole(null);
        setSites([]);
      }
    });

    return () => subscription.unsubscribe();
  }, [loadAdminData]);

  async function requestOtp(event: FormEvent) {
    event.preventDefault();
    setNotice("");
    setOtp("");

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        shouldCreateUser: false,
      },
    });

    if (error) {
      setOtpSent(false);
      setNotice(error.message);
      return;
    }

    setOtpSent(true);
    setNotice("A six-digit verification code has been sent to your email.");
  }

  async function verifyOtpCode(event: FormEvent) {
    event.preventDefault();
    setNotice("");

    const token = otp.replace(/\D/g, "").slice(0, 6);

    if (token.length !== 6) {
      setNotice("Enter the complete six-digit verification code.");
      return;
    }

    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token,
      type: "email",
    });

    if (error) {
      setNotice(error.message);
      return;
    }

    setNotice("Signed in successfully. Loading the dashboard…");
  }

  async function signOut() {
    await supabase.auth.signOut();
    setOtp("");
    setOtpSent(false);
    setNotice("Signed out.");
  }

  function startNewSite() {
    setEditor({ status: "draft", content: emptyContent() });
    setNotice("");
  }

  function openSite(site: SiteRow) {
    setEditor({
      id: site.id,
      status: site.status,
      content: structuredClone(site.content),
    });
    setNotice("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function updateContent<K extends keyof SiteContent>(key: K, value: SiteContent[K]) {
    setEditor((current) => ({
      ...current,
      content: { ...current.content, [key]: value },
    }));
  }

  async function saveSite(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setNotice("");

    const content = compactContent(editor.content);
    const slug = cleanSlug(content.slug);

    if (!slug || !content.piName || !content.labName || !content.headline) {
      setNotice("Please complete the slug, PI name, lab name, and headline.");
      setSaving(false);
      return;
    }

    const payload = { slug, status: editor.status, content: { ...content, slug } };

    const query = editor.id
      ? supabase.from("sites").update(payload).eq("id", editor.id).select().single()
      : supabase.from("sites").insert(payload).select().single();

    const { data, error } = await query;

    if (error) {
      setNotice(error.message);
      setSaving(false);
      return;
    }

    const saved = data as SiteRow;
    setSites((current) => {
      const remaining = current.filter((site) => site.id !== saved.id);
      return [...remaining, saved].sort((a, b) => a.slug.localeCompare(b.slug));
    });
    setEditor({ id: saved.id, status: saved.status, content: saved.content });
    setNotice(`Saved ${saved.slug}.`);
    setSaving(false);
  }

  async function archiveSite() {
    if (!editor.id || !selectedSite) return;
    if (!window.confirm(`Archive ${selectedSite.slug}? Its public concept will stop loading.`)) return;

    setSaving(true);
    const { data, error } = await supabase
      .from("sites")
      .update({ status: "archived" })
      .eq("id", editor.id)
      .select()
      .single();

    if (error) {
      setNotice(error.message);
    } else {
      const saved = data as SiteRow;
      setSites((current) => current.map((site) => (site.id === saved.id ? saved : site)));
      setEditor((current) => ({ ...current, status: "archived" }));
      setNotice(`${saved.slug} was archived.`);
    }
    setSaving(false);
  }

  if (!authReady) {
    return <main className="admin-loading">Preparing the secure dashboard…</main>;
  }

  if (!session) {
    return (
      <main className="admin-auth-page">
        <section className="admin-auth-card">
          <p className="eyebrow">LabNarrative administration</p>
          <h1>Secure platform access.</h1>
          <p>
            Sign in using the LabNarrative administrator email and the six-digit code sent to it.
          </p>
          <form onSubmit={requestOtp}>
            <Field label="Administrator email" value={email} onChange={setEmail} required />
            <button className="admin-primary-button" type="submit">
              {otpSent ? "Send a new code" : "Send verification code"}
            </button>
          </form>
          {otpSent && (
            <form onSubmit={verifyOtpCode}>
              <label className="admin-field">
                <span>Six-digit verification code</span>
                <input
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="123456"
                  value={otp}
                  onChange={(event) =>
                    setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  required
                />
              </label>
              <button className="admin-primary-button" type="submit">
                Verify code and sign in
              </button>
            </form>
          )}
          {notice && <p className="admin-notice">{notice}</p>}
          <Link href="/">← Return to platform</Link>
        </section>
      </main>
    );
  }

  if (role !== "admin") {
    return (
      <main className="admin-auth-page">
        <section className="admin-auth-card">
          <p className="eyebrow">Access restricted</p>
          <h1>Administrator permission required.</h1>
          <p>{loading ? "Checking permission…" : notice}</p>
          <button className="admin-secondary-button" onClick={signOut} type="button">
            Sign out
          </button>
        </section>
      </main>
    );
  }

  const content = editor.content;

  return (
    <main className="admin-shell">
      <header className="admin-topbar">
        <div>
          <span className="admin-brand">LabNarrative</span>
          <span>Administrator dashboard</span>
        </div>
        <div className="admin-top-actions">
          <span>{session.user.email}</span>
          <Link href="/">View platform</Link>
          <button onClick={signOut} type="button">Sign out</button>
        </div>
      </header>

      <div className="admin-layout">
        <aside className="admin-sidebar">
          <div className="admin-sidebar-heading">
            <div>
              <span className="admin-kicker">PI websites</span>
              <strong>{sites.length} records</strong>
            </div>
            <button onClick={startNewSite} type="button">+ New</button>
          </div>

          {loading && <p className="admin-muted">Loading sites…</p>}

          <div className="admin-site-list">
            {sites.map((site) => (
              <button
                className={site.id === editor.id ? "active" : ""}
                key={site.id}
                onClick={() => openSite(site)}
                type="button"
              >
                <span>{site.content.labName || site.slug}</span>
                <small>{site.slug} · {site.status}</small>
              </button>
            ))}
          </div>
        </aside>

        <section className="admin-workspace">
          <div className="admin-editor-heading">
            <div>
              <p className="admin-kicker">{editor.id ? "Edit PI website" : "Create PI website"}</p>
              <h1>{content.labName || "New laboratory concept"}</h1>
            </div>
            {content.slug && (
              <Link target="_blank" href={`/sites/${cleanSlug(content.slug)}`}>
                Open preview ↗
              </Link>
            )}
          </div>

          {notice && <p className="admin-notice">{notice}</p>}

          <form className="admin-form" onSubmit={saveSite}>
            <section className="admin-panel">
              <div className="admin-panel-heading">
                <span>01</span>
                <div><h2>Identity</h2><p>The essential PI and laboratory information.</p></div>
              </div>
              <div className="admin-form-grid">
                <Field label="Subdomain slug" value={content.slug} onChange={(value) => updateContent("slug", cleanSlug(value))} placeholder="wylie" required />
                <label className="admin-field">
                  <span>Website status</span>
                  <select value={editor.status} onChange={(event) => setEditor((current) => ({ ...current, status: event.target.value as SiteStatus }))}>
                    <option value="draft">Draft — administrator only</option>
                    <option value="concept">Concept — publicly shareable</option>
                    <option value="live">Live — approved client website</option>
                    <option value="archived">Archived — hidden</option>
                  </select>
                </label>
                <Field label="Principal investigator" value={content.piName} onChange={(value) => updateContent("piName", value)} required />
                <Field label="Laboratory name" value={content.labName} onChange={(value) => updateContent("labName", value)} required />
                <Field label="Academic title" value={content.title} onChange={(value) => updateContent("title", value)} />
                <Field label="Institution" value={content.institution} onChange={(value) => updateContent("institution", value)} />
              </div>
            </section>

            <section className="admin-panel">
              <div className="admin-panel-heading">
                <span>02</span>
                <div><h2>Scientific narrative</h2><p>The message visitors see first.</p></div>
              </div>
              <div className="admin-form-grid">
                <Field label="Research eyebrow" value={content.eyebrow} onChange={(value) => updateContent("eyebrow", value)} placeholder="p53 · Transposons · Development" />
                <div />
                <TextArea label="Main headline" value={content.headline} onChange={(value) => updateContent("headline", value)} rows={3} />
                <TextArea label="Introduction" value={content.introduction} onChange={(value) => updateContent("introduction", value)} rows={6} />
              </div>

              <div className="admin-list-heading"><h3>Focus areas</h3><button type="button" onClick={() => updateContent("focusAreas", [...content.focusAreas, ""])}>+ Add focus area</button></div>
              <div className="admin-compact-list">
                {content.focusAreas.map((area, index) => (
                  <div key={`focus-${index}`}>
                    <input value={area} onChange={(event) => updateContent("focusAreas", content.focusAreas.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} placeholder="Research focus" />
                    <button type="button" onClick={() => updateContent("focusAreas", content.focusAreas.filter((_, itemIndex) => itemIndex !== index))}>Remove</button>
                  </div>
                ))}
              </div>
            </section>

            <section className="admin-panel">
              <div className="admin-panel-heading"><span>03</span><div><h2>Research projects</h2><p>Add, remove, and reorder later as the platform expands.</p></div></div>
              <div className="admin-list-heading"><h3>{content.projects.length} projects</h3><button type="button" onClick={() => updateContent("projects", [...content.projects, { title: "", description: "" }])}>+ Add project</button></div>
              <div className="admin-repeat-list">
                {content.projects.map((project, index) => (
                  <article key={`project-${index}`}>
                    <div className="admin-repeat-number">{String(index + 1).padStart(2, "0")}</div>
                    <div className="admin-repeat-fields">
                      <Field label="Project title" value={project.title} onChange={(value) => updateContent("projects", content.projects.map((item, itemIndex) => itemIndex === index ? { ...item, title: value } : item))} />
                      <TextArea label="Description" value={project.description} onChange={(value) => updateContent("projects", content.projects.map((item, itemIndex) => itemIndex === index ? { ...item, description: value } : item))} rows={3} />
                    </div>
                    <button className="admin-remove-button" type="button" onClick={() => updateContent("projects", content.projects.filter((_, itemIndex) => itemIndex !== index))}>Remove</button>
                  </article>
                ))}
              </div>
            </section>

            <section className="admin-panel">
              <div className="admin-panel-heading"><span>04</span><div><h2>Team</h2><p>The principal investigator should remain first.</p></div></div>
              <div className="admin-list-heading"><h3>{content.team.length} members</h3><button type="button" onClick={() => updateContent("team", [...content.team, { name: "", role: "" }])}>+ Add member</button></div>
              <div className="admin-repeat-list compact">
                {content.team.map((member, index) => (
                  <article key={`member-${index}`}>
                    <div className="admin-repeat-number">{String(index + 1).padStart(2, "0")}</div>
                    <div className="admin-inline-fields">
                      <Field label="Name" value={member.name} onChange={(value) => updateContent("team", content.team.map((item, itemIndex) => itemIndex === index ? { ...item, name: value } : item))} />
                      <Field label="Role" value={member.role} onChange={(value) => updateContent("team", content.team.map((item, itemIndex) => itemIndex === index ? { ...item, role: value } : item))} />
                    </div>
                    <button className="admin-remove-button" type="button" onClick={() => updateContent("team", content.team.filter((_, itemIndex) => itemIndex !== index))}>Remove</button>
                  </article>
                ))}
              </div>
            </section>

            <section className="admin-panel">
              <div className="admin-panel-heading"><span>05</span><div><h2>Selected publications</h2><p>Add the most relevant work for the concept.</p></div></div>
              <div className="admin-list-heading"><h3>{content.publications.length} publications</h3><button type="button" onClick={() => updateContent("publications", [...content.publications, { title: "", journal: "", year: "", href: "" }])}>+ Add publication</button></div>
              <div className="admin-repeat-list">
                {content.publications.map((publication, index) => (
                  <article key={`publication-${index}`}>
                    <div className="admin-repeat-number">{String(index + 1).padStart(2, "0")}</div>
                    <div className="admin-repeat-fields">
                      <Field label="Publication title" value={publication.title} onChange={(value) => updateContent("publications", content.publications.map((item, itemIndex) => itemIndex === index ? { ...item, title: value } : item))} />
                      <div className="admin-inline-fields three">
                        <Field label="Journal" value={publication.journal} onChange={(value) => updateContent("publications", content.publications.map((item, itemIndex) => itemIndex === index ? { ...item, journal: value } : item))} />
                        <Field label="Year" value={publication.year} onChange={(value) => updateContent("publications", content.publications.map((item, itemIndex) => itemIndex === index ? { ...item, year: value } : item))} />
                        <Field label="Link (optional)" value={publication.href ?? ""} onChange={(value) => updateContent("publications", content.publications.map((item, itemIndex) => itemIndex === index ? { ...item, href: value } : item))} />
                      </div>
                    </div>
                    <button className="admin-remove-button" type="button" onClick={() => updateContent("publications", content.publications.filter((_, itemIndex) => itemIndex !== index))}>Remove</button>
                  </article>
                ))}
              </div>
            </section>

            <section className="admin-panel">
              <div className="admin-panel-heading"><span>06</span><div><h2>Visual theme</h2><p>Control the core color system for this concept.</p></div></div>
              <div className="admin-color-grid">
                {Object.entries(content.theme).map(([key, value]) => (
                  <label key={key} className="admin-color-field">
                    <span>{key}</span>
                    <div><input type="color" value={value} onChange={(event) => updateContent("theme", { ...content.theme, [key]: event.target.value })} /><input value={value} onChange={(event) => updateContent("theme", { ...content.theme, [key]: event.target.value })} /></div>
                  </label>
                ))}
              </div>
            </section>

            <div className="admin-save-bar">
              <div>
                <strong>{editor.id ? `Editing ${content.slug}` : "New site record"}</strong>
                <span>Changes become public when the status is Concept or Live.</span>
              </div>
              <div>
                {editor.id && <button className="admin-danger-button" type="button" onClick={archiveSite} disabled={saving}>Archive</button>}
                <button className="admin-primary-button" type="submit" disabled={saving}>{saving ? "Saving…" : "Save website"}</button>
              </div>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
