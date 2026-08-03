"use client";

import { createClient, type Session } from "@supabase/supabase-js";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import BourdonEditor from "@/components/admin/BourdonEditor";
import JsonImportPanel from "@/components/admin/JsonImportPanel";
import { defaultBourdonDesignSettings, type LabSite } from "@/lib/sites";

type SiteStatus = "draft" | "concept" | "live" | "archived";
type DomainStatus = "not_connected" | "connecting" | "https_pending" | "live" | "error" | "legacy";
type SiteTemplate =
  | "scientific-minimal"
  | "editorial"
  | "image-led"
  | "institutional"
  | "bourdon-full";

type Project = { title: string; description: string };
type TeamMember = { name: string; role: string };
type Publication = { title: string; journal: string; year: string; href?: string };
type RichResearchProject = {
  slug: string;
  title: string;
  summary: string;
  question: string;
  body: string[];
  methods: string[];
  papers: string[];
  figureImage: string;
  figureCaption: string;
};
type RichMember = {
  name: string;
  role: string;
  bio: string;
  image: string;
  href: string;
};
type Opportunity = {
  title: string;
  status: string;
  description: string;
  linkLabel: string;
  href: string;
};
type Theme = {
  background: string;
  surface: string;
  foreground: string;
  muted: string;
  accent: string;
};

type SiteContent = {
  schemaVersion?: number;
  design?: { key: string; version: number; settings?: Record<string, unknown> };
  template?: SiteTemplate;
  heroImage?: string;
  slug: string;
  piName: string;
  labName: string;
  labSubtitle?: string;
  title: string;
  institution: string;
  department?: string;
  address?: string;
  email?: string;
  phone?: string;
  profileUrl?: string;
  pubmedUrl?: string;
  eyebrow: string;
  headline: string;
  introduction: string;
  overview?: string;
  focusAreas: string[];
  projects: Project[];
  research?: RichResearchProject[];
  team: TeamMember[];
  members?: RichMember[];
  publications: Publication[];
  opportunities?: Opportunity[];
  theme: Theme;
  [key: string]: unknown;
};

type SiteRow = {
  id: string;
  slug: string;
  status: SiteStatus;
  content: SiteContent;
  updated_at: string;
  domain_status: DomainStatus;
  domain_url: string | null;
  domain_error: string | null;
  domain_connected_at: string | null;
  domain_checked_at: string | null;
  content_schema_version: number;
  design_key: string;
  design_version: number;
  design_settings: Record<string, unknown>;
};

type EditorState = {
  id?: string;
  status: SiteStatus;
  content: SiteContent;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

type TemplateDefinition = {
  id: SiteTemplate;
  label: string;
  description: string;
  bestFor: string;
  theme: Theme;
};

const templateOrder: SiteTemplate[] = [
  "scientific-minimal",
  "editorial",
  "image-led",
  "institutional",
  "bourdon-full",
];

const templateDefinitions: Record<SiteTemplate, TemplateDefinition> = {
  "scientific-minimal": {
    id: "scientific-minimal",
    label: "Scientific Minimal",
    description: "Quiet, precise, and spacious. The research narrative remains the main visual element.",
    bestFor: "Molecular biology · genetics · discovery science",
    theme: {
      background: "#eef1eb",
      surface: "#f8faf6",
      foreground: "#153229",
      muted: "#64726c",
      accent: "#1b5a45",
    },
  },
  editorial: {
    id: "editorial",
    label: "Editorial",
    description: "A publication-inspired composition with strong typography and an intellectual tone.",
    bestFor: "Established PIs · broad programmes · thought leadership",
    theme: {
      background: "#f3eee5",
      surface: "#fffaf2",
      foreground: "#261f1a",
      muted: "#6d6259",
      accent: "#9a5839",
    },
  },
  "image-led": {
    id: "image-led",
    label: "Image-led",
    description: "A cinematic, high-contrast design built to make a strong portrait or laboratory image central.",
    bestFor: "Translational research · technology · visually rich laboratories",
    theme: {
      background: "#101716",
      surface: "#192321",
      foreground: "#f4f0e8",
      muted: "#acb8b3",
      accent: "#d7a85a",
    },
  },
  institutional: {
    id: "institutional",
    label: "Institutional",
    description: "Structured, authoritative, and clear, with a visual language suited to universities and centres.",
    bestFor: "Clinical groups · consortia · institutes · funded programmes",
    theme: {
      background: "#edf1f4",
      surface: "#ffffff",
      foreground: "#142534",
      muted: "#62717d",
      accent: "#1d4f73",
    },
  },
  "bourdon-full": {
    id: "bourdon-full",
    label: "Bourdon Full",
    description: "A complete multi-page laboratory website with detailed projects, people, publications, opportunities, contact information, and scientific figures.",
    bestFor: "Premium PI concepts · detailed research programmes · full client websites",
    theme: {
      background: "#f8f8f5",
      surface: "#ffffff",
      foreground: "#132d3a",
      muted: "#647178",
      accent: "#117b79",
    },
  },
};

function normalizeTemplate(value: unknown): SiteTemplate {
  return templateOrder.includes(value as SiteTemplate)
    ? value as SiteTemplate
    : "scientific-minimal";
}

function designVersionFor(template: SiteTemplate): number {
  return template === "bourdon-full" ? 3 : 1;
}

function designSettingsFor(template: SiteTemplate, existing?: Record<string, unknown>): Record<string, unknown> {
  if (template !== "bourdon-full") return existing ?? {};
  return { ...defaultBourdonDesignSettings, ...(existing ?? {}) };
}

function blankRichProject(index: number): RichResearchProject {
  return {
    slug: `research-project-${index + 1}`,
    title: "",
    summary: "",
    question: "",
    body: [""],
    methods: [""],
    papers: [""],
    figureImage: "",
    figureCaption: "",
  };
}

function blankRichMember(index: number): RichMember {
  return {
    name: "",
    role: index === 0 ? "Principal Investigator" : "Researcher",
    bio: "",
    image: "",
    href: "",
  };
}

function blankOpportunity(index: number): Opportunity {
  const titles = ["Postgraduate study", "Postdoctoral research", "Collaborate with us"];
  return {
    title: titles[index] ?? "",
    status: "",
    description: "",
    linkLabel: "",
    href: "",
  };
}

function contentFromTemplate(template: SiteTemplate): SiteContent {
  const definition = templateDefinitions[template];
  const isFull = template === "bourdon-full";
  return {
    schemaVersion: isFull ? 3 : 1,
    design: { key: template, version: designVersionFor(template), settings: designSettingsFor(template) },
    template,
    heroImage: "",
    slug: "",
    piName: "",
    labName: "",
    labSubtitle: "",
    title: "",
    institution: "",
    department: "",
    address: "",
    email: "",
    phone: "",
    profileUrl: "",
    pubmedUrl: "",
    eyebrow: "",
    headline: "",
    introduction: "",
    overview: "",
    focusAreas: ["", "", ""],
    projects: Array.from({ length: 4 }, () => ({ title: "", description: "" })),
    research: isFull ? Array.from({ length: 4 }, (_, index) => blankRichProject(index)) : undefined,
    team: [
      { name: "", role: "Principal Investigator" },
      { name: "", role: "Postdoctoral Researcher" },
      { name: "", role: "Doctoral Researcher" },
    ],
    members: isFull ? Array.from({ length: 3 }, (_, index) => blankRichMember(index)) : undefined,
    publications: Array.from({ length: isFull ? 8 : 4 }, () => ({
      title: "",
      journal: "",
      year: "",
      href: "",
    })),
    opportunities: isFull ? Array.from({ length: 3 }, (_, index) => blankOpportunity(index)) : undefined,
    theme: { ...definition.theme },
  };
}

const emptyContent = (): SiteContent => contentFromTemplate("scientific-minimal");

function cleanSlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function compactContent(content: SiteContent): SiteContent {
  const template = normalizeTemplate(content.template);
  return {
    ...content,
    schemaVersion: template === "bourdon-full" ? 3 : 1,
    design: { key: template, version: designVersionFor(template), settings: designSettingsFor(template, content.design?.settings) },
    slug: cleanSlug(content.slug),
    focusAreas: content.focusAreas.map((item) => item.trim()).filter(Boolean),
    projects: content.projects
      .map((item) => ({ title: item.title.trim(), description: item.description.trim() }))
      .filter((item) => item.title || item.description),
    research: content.research
      ?.map((item) => ({
        slug: cleanSlug(item.slug || item.title),
        title: item.title.trim(),
        summary: item.summary.trim(),
        question: item.question.trim(),
        body: item.body.map((paragraph) => paragraph.trim()).filter(Boolean),
        methods: item.methods.map((method) => method.trim()).filter(Boolean),
        papers: item.papers.map((paper) => paper.trim()).filter(Boolean),
        figureImage: item.figureImage.trim(),
        figureCaption: item.figureCaption.trim(),
      }))
      .filter((item) => item.title || item.summary),
    team: content.team
      .map((item) => ({ name: item.name.trim(), role: item.role.trim() }))
      .filter((item) => item.name || item.role),
    members: content.members
      ?.map((item) => ({
        name: item.name.trim(),
        role: item.role.trim(),
        bio: item.bio.trim(),
        image: item.image.trim(),
        href: item.href.trim(),
      }))
      .filter((item) => item.name || item.role),
    publications: content.publications
      .map((item) => ({
        title: item.title.trim(),
        journal: item.journal.trim(),
        year: item.year.trim(),
        href: item.href?.trim() || undefined,
      }))
      .filter((item) => item.title || item.journal || item.year),
    opportunities: content.opportunities
      ?.map((item) => ({
        title: item.title.trim(),
        status: item.status.trim(),
        description: item.description.trim(),
        linkLabel: item.linkLabel.trim(),
        href: item.href.trim(),
      }))
      .filter((item) => item.title || item.description),
  };
}

const domainStatusLabels: Record<DomainStatus, string> = {
  not_connected: "Not connected",
  connecting: "Connecting",
  https_pending: "HTTPS pending",
  live: "Live",
  error: "Connection error",
  legacy: "Legacy site",
};

const domainStatusStyles: Record<DomainStatus, { background: string; color: string; border: string }> = {
  not_connected: { background: "#eef1eb", color: "#50615a", border: "#bdc8c2" },
  connecting: { background: "#e7eef2", color: "#244b5a", border: "#9fb6c0" },
  https_pending: { background: "#f5ead1", color: "#6a4a0c", border: "#d7a85a" },
  live: { background: "#dfeee7", color: "#12543f", border: "#6da58e" },
  error: { background: "#f3dfdf", color: "#812d32", border: "#c77b80" },
  legacy: { background: "#ece8f1", color: "#5c4b69", border: "#b7a9c2" },
};

function DomainBadge({ status }: { status: DomainStatus }) {
  const style = domainStatusStyles[status];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        border: `1px solid ${style.border}`,
        background: style.background,
        color: style.color,
        borderRadius: 999,
        padding: "0.28rem 0.58rem",
        fontSize: "0.72rem",
        fontWeight: 700,
        lineHeight: 1,
        whiteSpace: "nowrap",
      }}
    >
      {domainStatusLabels[status]}
    </span>
  );
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
  const [importing, setImporting] = useState(false);
  const [provisioning, setProvisioning] = useState(false);
  const [domainNotice, setDomainNotice] = useState("");
  const [domainUrl, setDomainUrl] = useState("");
  const [factoryOpen, setFactoryOpen] = useState(true);
  const [duplicateSourceId, setDuplicateSourceId] = useState("");

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
      .select("id,slug,status,content,updated_at,domain_status,domain_url,domain_error,domain_connected_at,domain_checked_at,content_schema_version,design_key,design_version,design_settings")
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
    setFactoryOpen(true);
    setDuplicateSourceId("");
    setNotice("");
    setDomainNotice("");
    setDomainUrl("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function beginFromTemplate(template: SiteTemplate) {
    setEditor({ status: "draft", content: contentFromTemplate(template) });
    setFactoryOpen(false);
    setDuplicateSourceId("");
    setNotice(`${templateDefinitions[template].label} template selected. Add the PI content, then save when ready.`);
    setDomainNotice("");
    setDomainUrl("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function duplicateStructure(source: SiteRow) {
    const sourceContent = structuredClone(source.content);
    const template = normalizeTemplate(sourceContent.template ?? source.design_key);
    const fresh = contentFromTemplate(template);

    const duplicated: SiteContent = {
      ...fresh,
      template,
      schemaVersion: template === "bourdon-full" ? 3 : 1,
      design: {
        key: template,
        version: designVersionFor(template),
        settings: designSettingsFor(template, structuredClone(sourceContent.design?.settings ?? source.design_settings ?? {})),
      },
      theme: { ...(sourceContent.theme ?? templateDefinitions[template].theme) },
      focusAreas: Array.from(
        { length: Math.max(sourceContent.focusAreas?.length ?? 0, 1) },
        () => "",
      ),
      projects: Array.from(
        { length: Math.max(sourceContent.projects?.length ?? 0, 1) },
        () => ({ title: "", description: "" }),
      ),
      research: template === "bourdon-full"
        ? Array.from(
            { length: Math.max(sourceContent.research?.length ?? 0, 1) },
            (_, index) => blankRichProject(index),
          )
        : undefined,
      team: (sourceContent.team?.length ? sourceContent.team : fresh.team).map((member, index) => ({
        name: "",
        role: index === 0 ? "Principal Investigator" : member.role,
      })),
      members: template === "bourdon-full"
        ? (sourceContent.members?.length ? sourceContent.members : fresh.members ?? []).map((member, index) => ({
            ...blankRichMember(index),
            role: index === 0 ? "Principal Investigator" : member.role,
          }))
        : undefined,
      publications: Array.from(
        { length: Math.max(sourceContent.publications?.length ?? 0, 1) },
        () => ({ title: "", journal: "", year: "", href: "" }),
      ),
      opportunities: template === "bourdon-full"
        ? Array.from(
            { length: Math.max(sourceContent.opportunities?.length ?? 0, 1) },
            (_, index) => blankOpportunity(index),
          )
        : undefined,
    };

    setEditor({ status: "draft", content: duplicated });
    setFactoryOpen(false);
    setDuplicateSourceId("");
    setNotice(`Created a safe blank structure from ${source.content.labName || source.slug}. Its identity, scientific text, publications, image, slug, and domain were not copied.`);
    setDomainNotice("");
    setDomainUrl("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function applyTemplate(template: SiteTemplate) {
    setNotice("");
    setEditor((current) => {
      const next = { ...current.content };
      const previousDesign = next.design;
      next.template = template;
      next.schemaVersion = template === "bourdon-full" ? 3 : 1;
      next.design = {
        key: template,
        version: designVersionFor(template),
        settings: designSettingsFor(template, previousDesign?.key === template ? previousDesign.settings : undefined),
      };
      next.theme = { ...templateDefinitions[template].theme };
      if (template === "bourdon-full") {
        next.research = next.research?.length ? next.research : Array.from({ length: 4 }, (_, index) => blankRichProject(index));
        next.members = next.members?.length ? next.members : Array.from({ length: 3 }, (_, index) => blankRichMember(index));
        next.opportunities = next.opportunities?.length ? next.opportunities : Array.from({ length: 3 }, (_, index) => blankOpportunity(index));
      }
      return { ...current, content: next };
    });
  }

  function openSite(site: SiteRow) {
    const loaded = structuredClone(site.content);
    loaded.template = normalizeTemplate(loaded.template ?? site.design_key);
    loaded.schemaVersion = loaded.schemaVersion ?? site.content_schema_version ?? 1;
    const designKey = normalizeTemplate(loaded.design?.key ?? site.design_key ?? loaded.template);
    loaded.design = {
      key: designKey,
      version: designVersionFor(designKey),
      settings: designSettingsFor(designKey, loaded.design?.settings ?? site.design_settings ?? {}),
    };
    setEditor({
      id: site.id,
      status: site.status,
      content: loaded,
    });
    setFactoryOpen(false);
    setDuplicateSourceId("");
    setNotice("");
    setDomainNotice("");
    setDomainUrl("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function updateContent<K extends keyof SiteContent>(key: K, value: SiteContent[K]) {
    setNotice("");
    if (key === "slug") {
      setDomainNotice("");
      setDomainUrl("");
    }
    setEditor((current) => ({
      ...current,
      content: { ...current.content, [key]: value },
    }));
  }

  async function refreshSiteRow(id: string): Promise<SiteRow | null> {
    const { data, error } = await supabase
      .from("sites")
      .select("id,slug,status,content,updated_at,domain_status,domain_url,domain_error,domain_connected_at,domain_checked_at,content_schema_version,design_key,design_version,design_settings")
      .eq("id", id)
      .single();

    if (error) {
      setNotice(error.message);
      return null;
    }

    const refreshed = data as SiteRow;
    setSites((current) => {
      const remaining = current.filter((site) => site.id !== refreshed.id);
      return [...remaining, refreshed].sort((a, b) => a.slug.localeCompare(b.slug));
    });
    return refreshed;
  }

  async function persistSite(): Promise<SiteRow | null> {
    setSaving(true);
    setNotice("");

    const content = compactContent(editor.content);
    const slug = cleanSlug(content.slug);

    if (!slug || !content.piName || !content.labName || !content.headline) {
      setNotice("Please complete the slug, PI name, lab name, and headline.");
      setSaving(false);
      return null;
    }

    const template = normalizeTemplate(content.template);
    const payload = {
      slug,
      status: editor.status,
      content: { ...content, slug },
      content_schema_version: template === "bourdon-full" ? 3 : 1,
      design_key: template,
      design_version: designVersionFor(template),
      design_settings: content.design?.settings ?? {},
    };

    const query = editor.id
      ? supabase.from("sites").update(payload).eq("id", editor.id).select().single()
      : supabase.from("sites").insert(payload).select().single();

    const { data, error } = await query;

    if (error) {
      setNotice(error.message);
      setSaving(false);
      return null;
    }

    const saved = data as SiteRow;
    setSites((current) => {
      const remaining = current.filter((site) => site.id !== saved.id);
      return [...remaining, saved].sort((a, b) => a.slug.localeCompare(b.slug));
    });
    setEditor({ id: saved.id, status: saved.status, content: saved.content });
    setNotice(`Saved ${saved.slug}.`);
    setSaving(false);
    return saved;
  }

  async function saveSite(event: FormEvent) {
    event.preventDefault();
    await persistSite();
  }

  async function importDraftSite(importedContent: LabSite) {
    setImporting(true);
    setNotice("");
    setDomainNotice("");
    setDomainUrl("");

    try {
      const content = compactContent(importedContent as unknown as SiteContent);
      const slug = cleanSlug(content.slug);
      const template = normalizeTemplate(content.template ?? content.design?.key);

      const { data: existing, error: existingError } = await supabase
        .from("sites")
        .select("id")
        .eq("slug", slug)
        .maybeSingle();

      if (existingError) throw new Error(existingError.message);
      if (existing) throw new Error(`The slug “${slug}” was created by another session. Choose a different slug and validate again.`);

      const payload = {
        slug,
        status: "draft" as const,
        content: { ...content, slug },
        content_schema_version: template === "bourdon-full" ? 3 : 1,
        design_key: template,
        design_version: designVersionFor(template),
        design_settings: content.design?.settings ?? {},
      };

      const { data, error } = await supabase
        .from("sites")
        .insert(payload)
        .select()
        .single();

      if (error) throw new Error(error.message);

      const saved = data as SiteRow;
      setSites((current) => [...current, saved].sort((a, b) => a.slug.localeCompare(b.slug)));
      setEditor({ id: saved.id, status: "draft", content: saved.content });
      setFactoryOpen(false);
      setDuplicateSourceId("");
      setNotice(`Imported ${saved.slug} as a private draft.`);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setImporting(false);
    }
  }

  async function provisionDomain(
    action: "connect" | "check" = "connect",
    targetSite?: SiteRow,
  ) {
    const site = targetSite ?? selectedSite;
    if (!site) {
      setNotice("Save the website record before connecting its subdomain.");
      return;
    }

    const slug = cleanSlug(site.slug || editor.content.slug);
    if (!slug) {
      setDomainNotice("Enter a valid subdomain slug first.");
      return;
    }

    if (site.domain_status === "legacy") {
      setDomainNotice(`${slug}.labnarrative.com is an existing legacy site and is protected from automatic replacement.`);
      return;
    }

    setProvisioning(true);
    setDomainNotice(
      action === "check"
        ? `Checking HTTPS for ${slug}.labnarrative.com…`
        : `Connecting ${slug}.labnarrative.com…`,
    );
    setDomainUrl(site.domain_url ?? "");

    if (action === "connect") {
      setSites((current) => current.map((item) =>
        item.id === site.id ? { ...item, domain_status: "connecting", domain_error: null } : item
      ));
    }

    const { data, error } = await supabase.functions.invoke("provision-subdomain", {
      body: { slug, action },
    });

    if (error) {
      let message = error.message;
      const context = (error as { context?: Response }).context;
      if (context) {
        try {
          const body = await context.clone().json() as { error?: string; url?: string };
          if (body.error) message = body.error;
          if (body.url) setDomainUrl(body.url);
        } catch {
          // Keep the Supabase error message if the response body is not JSON.
        }
      }
      setDomainNotice(message);
      await refreshSiteRow(site.id);
      setProvisioning(false);
      return;
    }

    const result = (data ?? {}) as {
      error?: string;
      url?: string;
      domainStatus?: DomainStatus;
      message?: string;
    };

    if (result.error) {
      setDomainNotice(result.error);
      await refreshSiteRow(site.id);
      setProvisioning(false);
      return;
    }

    const url = result.url ?? `https://${slug}.labnarrative.com`;
    setDomainUrl(url);
    setDomainNotice(
      result.message
        ?? (result.domainStatus === "live"
          ? `${slug}.labnarrative.com is live over HTTPS.`
          : `Connected ${slug}.labnarrative.com. HTTPS may take a few minutes.`),
    );
    await refreshSiteRow(site.id);
    setProvisioning(false);
  }

  async function saveAndConnect() {
    const saved = await persistSite();
    if (!saved) return;
    await provisionDomain("connect", saved);
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
  const isFullWebsite = normalizeTemplate(content.template) === "bourdon-full";
  const saveSucceeded = notice.startsWith("Saved ");

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
                <small style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
                  <span>{site.slug} · {site.status}</span>
                  <DomainBadge status={site.domain_status} />
                </small>
              </button>
            ))}
          </div>
        </aside>

        <section className="admin-workspace">
          <div className="admin-editor-heading">
            <div>
              <p className="admin-kicker">
                {factoryOpen ? "Concept Factory" : editor.id ? "Edit PI website" : "Create PI website"}
              </p>
              <h1>
                {factoryOpen
                  ? "Start from a design system."
                  : content.labName || "New laboratory concept"}
              </h1>
              {!factoryOpen && (
                <div style={{ marginTop: "0.75rem", display: "flex", gap: "0.55rem", alignItems: "center", flexWrap: "wrap" }}>
                  <DomainBadge status={selectedSite?.domain_status ?? "not_connected"} />
                  <span className="admin-template-label">
                    {templateDefinitions[normalizeTemplate(content.template)].label}
                  </span>
                </div>
              )}
            </div>
            {!factoryOpen && content.slug && (
              <Link target="_blank" href={`/admin/preview/${cleanSlug(content.slug)}`}>
                Open preview ↗
              </Link>
            )}
          </div>

          {notice && <p className="admin-notice">{notice}</p>}

          {factoryOpen && (
            <section className="admin-factory" aria-label="LabNarrative concept factory">
              <div className="admin-factory-intro">
                <div>
                  <span className="admin-kicker">Create from template</span>
                  <h2>Choose the visual direction first.</h2>
                </div>
                <p>
                  Every option uses the same secure LabNarrative platform. The template controls the composition,
                  typography, palette, and starter structure; all PI-specific fields begin empty.
                </p>
              </div>

              <JsonImportPanel
                existingSlugs={sites.map((site) => site.slug)}
                importing={importing}
                onImport={importDraftSite}
              />

              <div className="admin-template-divider">
                <span>or build manually</span>
              </div>

              <div className="admin-template-grid">
                {templateOrder.map((templateId) => {
                  const definition = templateDefinitions[templateId];
                  return (
                    <button
                      className="admin-template-card"
                      key={templateId}
                      onClick={() => beginFromTemplate(templateId)}
                      type="button"
                    >
                      <div
                        className={`admin-template-preview template-preview-${templateId}`}
                        style={{
                          background: definition.theme.background,
                          color: definition.theme.foreground,
                          borderColor: definition.theme.muted,
                        }}
                        aria-hidden="true"
                      >
                        <span style={{ background: definition.theme.accent }} />
                        <strong>Research<br />with direction.</strong>
                        <i style={{ background: definition.theme.surface }} />
                      </div>
                      <span className="admin-template-card-copy">
                        <strong>{definition.label}</strong>
                        <small>{definition.description}</small>
                        <em>{definition.bestFor}</em>
                      </span>
                      <span className="admin-template-action">Use template →</span>
                    </button>
                  );
                })}
              </div>

              <div className="admin-duplicate-panel">
                <div>
                  <span className="admin-kicker">Duplicate structure</span>
                  <h2>Reuse the framework of an existing concept.</h2>
                  <p>
                    LabNarrative copies only the design template, color system, section counts, and team-role structure.
                    PI identity, scientific writing, publications, images, slug, and domain connection remain blank.
                  </p>
                </div>
                <div className="admin-duplicate-controls">
                  <label className="admin-field">
                    <span>Source website</span>
                    <select value={duplicateSourceId} onChange={(event) => setDuplicateSourceId(event.target.value)}>
                      <option value="">Choose an existing website…</option>
                      {sites.filter((site) => site.status !== "archived").map((site) => (
                        <option key={site.id} value={site.id}>
                          {site.content.labName || site.slug} — {site.slug}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="admin-factory-primary"
                    type="button"
                    disabled={!duplicateSourceId}
                    onClick={() => {
                      const source = sites.find((site) => site.id === duplicateSourceId);
                      if (source) duplicateStructure(source);
                    }}
                  >
                    Duplicate safe structure
                  </button>
                </div>
              </div>
            </section>
          )}

          {!factoryOpen && (
          <form className="admin-form" onSubmit={saveSite}>
            {isFullWebsite ? (
              <BourdonEditor
                content={content as unknown as LabSite}
                status={editor.status}
                onContentChange={(nextContent) => {
                  setNotice("");
                  setEditor((current) => ({
                    ...current,
                    content: nextContent as unknown as SiteContent,
                  }));
                }}
                onStatusChange={(nextStatus) => {
                  setNotice("");
                  setEditor((current) => ({ ...current, status: nextStatus }));
                }}
              />
            ) : (
              <>
            <section className="admin-panel">
              <div className="admin-panel-heading">
                <span>01</span>
                <div><h2>Identity</h2><p>The essential PI and laboratory information.</p></div>
              </div>
              <div className="admin-form-grid">
                <Field label="Subdomain slug" value={content.slug} onChange={(value) => updateContent("slug", cleanSlug(value))} placeholder="wylie" required />
                <label className="admin-field">
                  <span>Website status</span>
                  <select value={editor.status} onChange={(event) => { setNotice(""); setEditor((current) => ({ ...current, status: event.target.value as SiteStatus })); }}>
                    <option value="draft">Draft — administrator only</option>
                    <option value="concept">Concept — publicly shareable</option>
                    <option value="live">Live — approved client website</option>
                    <option value="archived">Archived — hidden</option>
                  </select>
                </label>
                <label className="admin-field">
                  <span>Design template</span>
                  <select
                    value={normalizeTemplate(content.template)}
                    onChange={(event) => applyTemplate(event.target.value as SiteTemplate)}
                  >
                    {templateOrder.map((templateId) => (
                      <option key={templateId} value={templateId}>
                        {templateDefinitions[templateId].label}
                      </option>
                    ))}
                  </select>
                </label>
                <Field
                  label="Hero image URL (optional)"
                  value={content.heroImage ?? ""}
                  onChange={(value) => updateContent("heroImage", value)}
                  placeholder="https://…"
                />
                <Field label="Principal investigator" value={content.piName} onChange={(value) => updateContent("piName", value)} required />
                <Field label="Laboratory name" value={content.labName} onChange={(value) => updateContent("labName", value)} required />
                <Field label="Academic title" value={content.title} onChange={(value) => updateContent("title", value)} />
                <Field label="Institution" value={content.institution} onChange={(value) => updateContent("institution", value)} />
                {isFullWebsite && (
                  <>
                    <Field label="Laboratory subtitle" value={content.labSubtitle ?? ""} onChange={(value) => updateContent("labSubtitle", value)} placeholder="Molecular Oncology · University of Dundee" />
                    <Field label="Department or school" value={content.department ?? ""} onChange={(value) => updateContent("department", value)} />
                    <Field label="Email" value={content.email ?? ""} onChange={(value) => updateContent("email", value)} />
                    <Field label="Phone" value={content.phone ?? ""} onChange={(value) => updateContent("phone", value)} />
                    <Field label="PI profile URL" value={content.profileUrl ?? ""} onChange={(value) => updateContent("profileUrl", value)} placeholder="https://…" />
                    <Field label="PubMed URL" value={content.pubmedUrl ?? ""} onChange={(value) => updateContent("pubmedUrl", value)} placeholder="https://…" />
                    <TextArea label="Postal address" value={content.address ?? ""} onChange={(value) => updateContent("address", value)} rows={4} />
                  </>
                )}
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
                {isFullWebsite && (
                  <TextArea label="Detailed laboratory overview" value={content.overview ?? ""} onChange={(value) => updateContent("overview", value)} rows={8} placeholder="A longer explanation of the laboratory programme for the home page." />
                )}
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
              <div className="admin-panel-heading"><span>03</span><div><h2>Research projects</h2><p>{isFullWebsite ? "Detailed project pages with scientific questions, methods, papers, and figures." : "Add the core research projects for this concept."}</p></div></div>
              {isFullWebsite ? (
                <>
                  <div className="admin-list-heading"><h3>{content.research?.length ?? 0} detailed projects</h3><button type="button" onClick={() => updateContent("research", [...(content.research ?? []), blankRichProject(content.research?.length ?? 0)])}>+ Add detailed project</button></div>
                  <div className="admin-repeat-list admin-rich-repeat-list">
                    {(content.research ?? []).map((project, index) => (
                      <article key={`rich-project-${index}`}>
                        <div className="admin-repeat-number">{String(index + 1).padStart(2, "0")}</div>
                        <div className="admin-repeat-fields">
                          <div className="admin-inline-fields">
                            <Field label="Project title" value={project.title} onChange={(value) => updateContent("research", (content.research ?? []).map((item, itemIndex) => itemIndex === index ? { ...item, title: value } : item))} />
                            <Field label="Project slug" value={project.slug} onChange={(value) => updateContent("research", (content.research ?? []).map((item, itemIndex) => itemIndex === index ? { ...item, slug: cleanSlug(value) } : item))} placeholder="p53-isoform-network" />
                          </div>
                          <TextArea label="Project summary" value={project.summary} onChange={(value) => updateContent("research", (content.research ?? []).map((item, itemIndex) => itemIndex === index ? { ...item, summary: value } : item))} rows={4} />
                          <TextArea label="Central research question" value={project.question} onChange={(value) => updateContent("research", (content.research ?? []).map((item, itemIndex) => itemIndex === index ? { ...item, question: value } : item))} rows={3} />
                          <TextArea label="Project narrative — separate paragraphs with a blank line" value={project.body.join("\n\n")} onChange={(value) => updateContent("research", (content.research ?? []).map((item, itemIndex) => itemIndex === index ? { ...item, body: value.split(/\n\s*\n/).map((part) => part.trim()) } : item))} rows={8} />
                          <div className="admin-inline-fields">
                            <TextArea label="Methods — one per line" value={project.methods.join("\n")} onChange={(value) => updateContent("research", (content.research ?? []).map((item, itemIndex) => itemIndex === index ? { ...item, methods: value.split("\n") } : item))} rows={6} />
                            <TextArea label="Research landmarks — one per line" value={project.papers.join("\n")} onChange={(value) => updateContent("research", (content.research ?? []).map((item, itemIndex) => itemIndex === index ? { ...item, papers: value.split("\n") } : item))} rows={6} />
                          </div>
                          <div className="admin-inline-fields">
                            <Field label="Scientific figure or image URL" value={project.figureImage} onChange={(value) => updateContent("research", (content.research ?? []).map((item, itemIndex) => itemIndex === index ? { ...item, figureImage: value } : item))} placeholder="https://… or data:image/…" />
                            <Field label="Figure caption" value={project.figureCaption} onChange={(value) => updateContent("research", (content.research ?? []).map((item, itemIndex) => itemIndex === index ? { ...item, figureCaption: value } : item))} />
                          </div>
                        </div>
                        <button className="admin-remove-button" type="button" onClick={() => updateContent("research", (content.research ?? []).filter((_, itemIndex) => itemIndex !== index))}>Remove</button>
                      </article>
                    ))}
                  </div>
                </>
              ) : (
                <>
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
                </>
              )}
            </section>

            <section className="admin-panel">
              <div className="admin-panel-heading"><span>04</span><div><h2>Team</h2><p>{isFullWebsite ? "Detailed profiles with photographs, biographies, and external links." : "The principal investigator should remain first."}</p></div></div>
              {isFullWebsite ? (
                <>
                  <div className="admin-list-heading"><h3>{content.members?.length ?? 0} detailed profiles</h3><button type="button" onClick={() => updateContent("members", [...(content.members ?? []), blankRichMember(content.members?.length ?? 0)])}>+ Add profile</button></div>
                  <div className="admin-repeat-list admin-rich-repeat-list">
                    {(content.members ?? []).map((member, index) => (
                      <article key={`rich-member-${index}`}>
                        <div className="admin-repeat-number">{String(index + 1).padStart(2, "0")}</div>
                        <div className="admin-repeat-fields">
                          <div className="admin-inline-fields">
                            <Field label="Name" value={member.name} onChange={(value) => updateContent("members", (content.members ?? []).map((item, itemIndex) => itemIndex === index ? { ...item, name: value } : item))} />
                            <Field label="Role" value={member.role} onChange={(value) => updateContent("members", (content.members ?? []).map((item, itemIndex) => itemIndex === index ? { ...item, role: value } : item))} />
                          </div>
                          <TextArea label="Biography" value={member.bio} onChange={(value) => updateContent("members", (content.members ?? []).map((item, itemIndex) => itemIndex === index ? { ...item, bio: value } : item))} rows={5} />
                          <div className="admin-inline-fields">
                            <Field label="Photograph URL" value={member.image} onChange={(value) => updateContent("members", (content.members ?? []).map((item, itemIndex) => itemIndex === index ? { ...item, image: value } : item))} placeholder="https://… or data:image/…" />
                            <Field label="Profile URL" value={member.href} onChange={(value) => updateContent("members", (content.members ?? []).map((item, itemIndex) => itemIndex === index ? { ...item, href: value } : item))} placeholder="https://…" />
                          </div>
                        </div>
                        <button className="admin-remove-button" type="button" onClick={() => updateContent("members", (content.members ?? []).filter((_, itemIndex) => itemIndex !== index))}>Remove</button>
                      </article>
                    ))}
                  </div>
                </>
              ) : (
                <>
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
                </>
              )}
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

            {isFullWebsite && (
              <section className="admin-panel">
                <div className="admin-panel-heading"><span>06</span><div><h2>Opportunities</h2><p>Postgraduate study, postdoctoral routes, collaborations, and other calls to action.</p></div></div>
                <div className="admin-list-heading"><h3>{content.opportunities?.length ?? 0} opportunity cards</h3><button type="button" onClick={() => updateContent("opportunities", [...(content.opportunities ?? []), blankOpportunity(content.opportunities?.length ?? 0)])}>+ Add opportunity</button></div>
                <div className="admin-repeat-list admin-rich-repeat-list">
                  {(content.opportunities ?? []).map((opportunity, index) => (
                    <article key={`opportunity-${index}`}>
                      <div className="admin-repeat-number">{String(index + 1).padStart(2, "0")}</div>
                      <div className="admin-repeat-fields">
                        <div className="admin-inline-fields">
                          <Field label="Title" value={opportunity.title} onChange={(value) => updateContent("opportunities", (content.opportunities ?? []).map((item, itemIndex) => itemIndex === index ? { ...item, title: value } : item))} />
                          <Field label="Status label" value={opportunity.status} onChange={(value) => updateContent("opportunities", (content.opportunities ?? []).map((item, itemIndex) => itemIndex === index ? { ...item, status: value } : item))} placeholder="Enquiries welcome" />
                        </div>
                        <TextArea label="Description" value={opportunity.description} onChange={(value) => updateContent("opportunities", (content.opportunities ?? []).map((item, itemIndex) => itemIndex === index ? { ...item, description: value } : item))} rows={5} />
                        <div className="admin-inline-fields">
                          <Field label="Link label" value={opportunity.linkLabel} onChange={(value) => updateContent("opportunities", (content.opportunities ?? []).map((item, itemIndex) => itemIndex === index ? { ...item, linkLabel: value } : item))} placeholder="Explore research degrees" />
                          <Field label="Link URL" value={opportunity.href} onChange={(value) => updateContent("opportunities", (content.opportunities ?? []).map((item, itemIndex) => itemIndex === index ? { ...item, href: value } : item))} placeholder="https://… or mailto:…" />
                        </div>
                      </div>
                      <button className="admin-remove-button" type="button" onClick={() => updateContent("opportunities", (content.opportunities ?? []).filter((_, itemIndex) => itemIndex !== index))}>Remove</button>
                    </article>
                  ))}
                </div>
              </section>
            )}

            <section className="admin-panel">
              <div className="admin-panel-heading"><span>{isFullWebsite ? "07" : "06"}</span><div><h2>Visual theme</h2><p>Control the core color system for this concept.</p></div></div>
              <div className="admin-color-grid">
                {Object.entries(content.theme).map(([key, value]) => (
                  <label key={key} className="admin-color-field">
                    <span>{key}</span>
                    <div><input type="color" value={value} onChange={(event) => updateContent("theme", { ...content.theme, [key]: event.target.value })} /><input value={value} onChange={(event) => updateContent("theme", { ...content.theme, [key]: event.target.value })} /></div>
                  </label>
                ))}
              </div>
            </section>

              </>
            )}

            <div className="admin-save-bar">
              <div>
                <strong>{editor.id ? `Editing ${content.slug}` : "New site record"}</strong>
                <span style={{ display: "flex", alignItems: "center", gap: "0.55rem", flexWrap: "wrap" }}>
                  <DomainBadge status={selectedSite?.domain_status ?? "not_connected"} />
                  <span>
                    {selectedSite?.domain_status === "legacy"
                      ? "This subdomain still points to the original external website."
                      : "Changes become public when the status is Concept or Live."}
                  </span>
                </span>
                {selectedSite?.domain_error && (
                  <span style={{ color: "#f2b7ba", maxWidth: "52rem" }}>{selectedSite.domain_error}</span>
                )}
              </div>
              <div>
                {notice && <span className="admin-save-feedback" role="status" aria-live="polite">{notice}</span>}
                {domainNotice && (
                  <span className="admin-save-feedback" role="status" aria-live="polite">
                    {domainNotice}
                    {domainUrl && <> <a href={domainUrl} target="_blank" rel="noreferrer">Open ↗</a></>}
                  </span>
                )}

                {(selectedSite?.domain_status === "https_pending" || selectedSite?.domain_status === "connecting") && (
                  <button
                    className="admin-secondary-button"
                    type="button"
                    onClick={() => void provisionDomain("check")}
                    disabled={saving || provisioning}
                    style={{
                      backgroundColor: "#d7a85a",
                      borderColor: "#d7a85a",
                      color: "#101617",
                      fontWeight: 700,
                    }}
                  >
                    {provisioning ? "Checking…" : "Check domain status"}
                  </button>
                )}

                {selectedSite?.domain_status === "live" && selectedSite.domain_url && (
                  <a
                    className="admin-secondary-button"
                    href={selectedSite.domain_url}
                    target="_blank"
                    rel="noreferrer"
                    style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}
                  >
                    Open live website ↗
                  </a>
                )}

                {editor.id
                  && selectedSite?.domain_status !== "live"
                  && selectedSite?.domain_status !== "https_pending"
                  && selectedSite?.domain_status !== "connecting"
                  && selectedSite?.domain_status !== "legacy" && (
                    <button
                      className="admin-secondary-button"
                      type="button"
                      onClick={() => void saveAndConnect()}
                      disabled={saving || provisioning}
                      style={{
                        backgroundColor: "#d7a85a",
                        borderColor: "#d7a85a",
                        color: "#101617",
                        fontWeight: 700,
                      }}
                    >
                      {saving || provisioning
                        ? "Saving & connecting…"
                        : selectedSite?.domain_status === "error"
                          ? "Save & retry connection"
                          : "Save & connect website"}
                    </button>
                  )}

                {!editor.id && (
                  <button
                    className="admin-secondary-button"
                    type="button"
                    onClick={() => void saveAndConnect()}
                    disabled={saving || provisioning}
                    style={{
                      backgroundColor: "#d7a85a",
                      borderColor: "#d7a85a",
                      color: "#101617",
                      fontWeight: 700,
                    }}
                  >
                    {saving || provisioning ? "Saving & connecting…" : "Save & connect website"}
                  </button>
                )}

                {editor.id && <button className="admin-danger-button" type="button" onClick={archiveSite} disabled={saving || provisioning}>Archive</button>}
                <button className="admin-primary-button" type="submit" disabled={saving || provisioning}>{saving ? "Saving…" : saveSucceeded ? "Saved ✓" : "Save only"}</button>
              </div>
            </div>
          </form>
          )}
        </section>
      </div>
    </main>
  );
}
