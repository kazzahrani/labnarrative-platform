"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import SiteShell from "@/components/SiteShell";
import VisualOverridesHost, { type VisualOverride } from "@/components/VisualOverridesHost";
import { browserSupabase as supabase } from "@/lib/supabase-browser";
import {
  getBourdonPages,
  type LabSite,
  type SiteRoute,
  type SiteSection,
} from "@/lib/sites";
import styles from "./visual-site-editor.module.css";

const BUCKET = "labnarrative-images";
const MAX_IMAGE_SIZE_BYTES = 25 * 1024 * 1024;
const pageOrder: Array<{ section: SiteSection; label: string }> = [
  { section: "home", label: "Home" },
  { section: "research", label: "Research" },
  { section: "members", label: "Members" },
  { section: "publications", label: "Publications" },
  { section: "join", label: "Join" },
  { section: "contact", label: "Contact" },
];

type SiteStatus = "draft" | "concept" | "live" | "archived";
type Validation = { ok?: boolean; issues?: string[]; engineV3?: boolean };
type SiteMeta = {
  id: string;
  slug: string;
  status: SiteStatus;
  content: LabSite;
  updatedAt: string;
  domainStatus?: string | null;
  domainUrl?: string | null;
  outreachStatus?: string | null;
};
type Revision = {
  id: string;
  content: LabSite;
  note?: string;
  baseSiteUpdatedAt: string;
  updatedAt: string;
  validation?: Validation;
};
type HistoryItem = {
  id: string;
  status: "published" | "snapshot";
  note?: string;
  source?: string;
  createdAt?: string;
  updatedAt?: string;
  publishedAt?: string;
  restoreOf?: string | null;
  validation?: Validation;
};
type Workspace = {
  site: SiteMeta;
  revision: Revision;
  history: HistoryItem[];
  validation: Validation;
  engineV3?: boolean;
};
type Modal = null | "add" | "manage" | "settings" | "history" | "validation";
type StringEntry = { path: string; value: string };
type ImageTarget = {
  element: HTMLImageElement;
  selector: string;
  route: string;
  path?: string;
  value: string;
  x: number;
  y: number;
};

type UploadTarget = { path: string } | { selector: string; route: string };

type ManagedCollection = "research" | "members" | "publications" | "opportunities";

function formatDate(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Riyadh",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function routeKey(route: SiteRoute) {
  return `${route.section}${route.projectSlug ? `:${route.projectSlug}` : ""}`;
}

function safeSegment(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "draft";
}

function fileExtension(file: File) {
  const fromName = file.name.split(".").pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]+$/.test(fromName)) return fromName;
  const map: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };
  return map[file.type] || "jpg";
}

function normalizeText(value: string) {
  return value
    .replace(/[→↗←]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase();
}

function isUrlLike(value: string) {
  return /^(https?:\/\/|mailto:|tel:)/i.test(value.trim());
}

function collectStrings(value: unknown, path = "", output: StringEntry[] = []): StringEntry[] {
  if (typeof value === "string") {
    if (path && !path.startsWith("visualOverrides")) output.push({ path, value });
    return output;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectStrings(item, path ? `${path}.${index}` : String(index), output));
    return output;
  }
  if (value && typeof value === "object") {
    Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
      const next = path ? `${path}.${key}` : key;
      collectStrings(item, next, output);
    });
  }
  return output;
}

function getAtPath(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => {
    if (current == null) return undefined;
    if (Array.isArray(current)) return current[Number(key)];
    if (typeof current === "object") return (current as Record<string, unknown>)[key];
    return undefined;
  }, value);
}

function setAtPath<T>(value: T, path: string, nextValue: unknown): T {
  const clone = structuredClone(value);
  const keys = path.split(".");
  let current: any = clone;
  keys.forEach((key, index) => {
    const last = index === keys.length - 1;
    const nextKey = keys[index + 1];
    if (last) {
      if (Array.isArray(current)) current[Number(key)] = nextValue;
      else current[key] = nextValue;
      return;
    }
    const numericNext = nextKey != null && /^\d+$/.test(nextKey);
    if (Array.isArray(current)) {
      const numeric = Number(key);
      current[numeric] ??= numericNext ? [] : {};
      current = current[numeric];
    } else {
      current[key] ??= numericNext ? [] : {};
      current = current[key];
    }
  });
  return clone;
}

function applyStructuredChange(site: LabSite, path: string, value: unknown): LabSite {
  let next = setAtPath(site, path, value);
  const researchMatch = path.match(/^research\.(\d+)\.(title|summary)$/);
  const projectMatch = path.match(/^projects\.(\d+)\.(title|description)$/);
  const memberMatch = path.match(/^members\.(\d+)\.(name|role)$/);
  const teamMatch = path.match(/^team\.(\d+)\.(name|role)$/);

  if (researchMatch) {
    const [, index, key] = researchMatch;
    const mirror = key === "title" ? "title" : "description";
    next = setAtPath(next, `projects.${index}.${mirror}`, value);
  } else if (projectMatch) {
    const [, index, key] = projectMatch;
    const mirror = key === "title" ? "title" : "summary";
    if (next.research?.[Number(index)]) next = setAtPath(next, `research.${index}.${mirror}`, value);
  } else if (memberMatch) {
    const [, index, key] = memberMatch;
    next = setAtPath(next, `team.${index}.${key}`, value);
  } else if (teamMatch) {
    const [, index, key] = teamMatch;
    if (next.members?.[Number(index)]) next = setAtPath(next, `members.${index}.${key}`, value);
  }
  return next;
}

function visualOverrides(site: LabSite): VisualOverride[] {
  const value = (site as LabSite & { visualOverrides?: unknown }).visualOverrides;
  return Array.isArray(value) ? value.filter(Boolean) as VisualOverride[] : [];
}

function withOverride(site: LabSite, override: VisualOverride): LabSite {
  const existing = visualOverrides(site);
  const without = existing.filter((item) => !(item.route === override.route && item.selector === override.selector && item.kind === override.kind));
  return { ...site, visualOverrides: [...without, override] } as LabSite;
}

function withoutOverride(site: LabSite, index: number): LabSite {
  return { ...site, visualOverrides: visualOverrides(site).filter((_, itemIndex) => itemIndex !== index) } as LabSite;
}

function selectorFor(element: HTMLElement, root: HTMLElement) {
  const parts: string[] = [];
  let current: HTMLElement | null = element;
  while (current && current !== root) {
    const parent = current.parentElement;
    if (!parent) break;
    const tag = current.tagName.toLowerCase();
    const siblings = Array.from(parent.children).filter((item) => item.tagName === current!.tagName);
    const index = siblings.indexOf(current) + 1;
    parts.unshift(siblings.length > 1 ? `${tag}:nth-of-type(${index})` : tag);
    current = parent;
  }
  return parts.join(" > ");
}

function pagePathScore(path: string, route: SiteRoute, element: HTMLElement) {
  let score = 0;
  if (element.closest("header") && path.startsWith("pages.navigation.")) score += 150;
  if (element.closest("header") && path === "labName") score += 120;
  if (element.closest("footer") && path.startsWith("pages.home.footer")) score += 160;
  if (element.closest("footer") && path.startsWith("pages.navigation.")) score += 120;
  if (path.startsWith(`pages.${route.section}.`)) score += 120;
  if (route.section === "home" && path.startsWith("pages.home.")) score += 100;
  if (route.section === "research" && path.startsWith("research.")) score += 100;
  if (route.section === "members" && path.startsWith("members.")) score += 100;
  if (route.section === "publications" && path.startsWith("publications.")) score += 100;
  if (route.section === "join" && path.startsWith("opportunities.")) score += 100;
  if (route.section === "contact" && path.startsWith("pages.contact.")) score += 100;
  if (!path.includes(".")) score += 20;
  return score;
}

function findTextPath(materialized: LabSite, route: SiteRoute, element: HTMLElement, text: string): string | undefined {
  const normalized = normalizeText(text);
  if (!normalized) return undefined;
  const matches = collectStrings(materialized)
    .filter((entry) => !isUrlLike(entry.value) && normalizeText(entry.value) === normalized)
    .map((entry) => ({ ...entry, score: pagePathScore(entry.path, route, element) + (entry.value.trim() === text.trim() ? 10 : 0) }))
    .sort((a, b) => b.score - a.score);
  return matches[0]?.path;
}

function normalizeImageUrl(value: string) {
  try { return new URL(value, window.location.origin).toString(); } catch { return value; }
}

function findImagePath(materialized: LabSite, route: SiteRoute, element: HTMLElement, src: string): string | undefined {
  const normalized = normalizeImageUrl(src);
  const matches = collectStrings(materialized)
    .filter((entry) => isUrlLike(entry.value) || /\.(png|jpe?g|webp|gif|svg)(\?|$)/i.test(entry.value))
    .filter((entry) => normalizeImageUrl(entry.value) === normalized)
    .map((entry) => ({ ...entry, score: pagePathScore(entry.path, route, element) + (entry.path.toLowerCase().includes("image") ? 20 : 0) }))
    .sort((a, b) => b.score - a.score);
  return matches[0]?.path;
}

function editableTextElement(target: HTMLElement, root: HTMLElement): HTMLElement | null {
  let current: HTMLElement | null = target;
  while (current && current !== root) {
    const tag = current.tagName.toLowerCase();
    if (["h1","h2","h3","h4","h5","h6","p","span","strong","b","figcaption","a"].includes(tag)) {
      if ((current.innerText || "").trim()) return current;
    }
    if (tag === "div" && current.children.length === 0 && (current.innerText || "").trim()) return current;
    current = current.parentElement;
  }
  return null;
}

function routeFromEditorHref(href: string, basePath: string): SiteRoute | null {
  try {
    const url = new URL(href, window.location.origin);
    if (!url.pathname.startsWith(basePath)) return null;
    const remainder = url.pathname.slice(basePath.length).split("/").filter(Boolean);
    const first = remainder[0] || "home";
    const aliases: Record<string, SiteSection> = { home:"home", research:"research", members:"members", team:"members", publications:"publications", join:"join", opportunities:"join", contact:"contact" };
    const section = aliases[first] || "home";
    return { section, projectSlug: section === "research" ? remainder[1] : undefined };
  } catch {
    return null;
  }
}

function SettingField({ label, value, onChange, type = "text", wide = false }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "email" | "url" | "color";
  wide?: boolean;
}) {
  return <label className={wide ? styles.settingWide : styles.settingField}><span>{label}</span><input type={type} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function ModalShell({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: ReactNode }) {
  return <div className={styles.modalBackdrop} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className={styles.modal}><header><div><h2>{title}</h2>{subtitle ? <p>{subtitle}</p> : null}</div><button type="button" onClick={onClose}>Close</button></header><div className={styles.modalBody}>{children}</div></section></div>;
}

export default function VisualSiteEditor({ slug }: { slug: string }) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [content, setContent] = useState<LabSite | null>(null);
  const contentRef = useRef<LabSite | null>(null);
  const [note, setNote] = useState("");
  const [route, setRoute] = useState<SiteRoute>({ section: "home" });
  const [validation, setValidation] = useState<Validation>({ ok: true, issues: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [modal, setModal] = useState<Modal>(null);
  const [editMode, setEditMode] = useState(true);
  const [imageTarget, setImageTarget] = useState<ImageTarget | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const hoverRef = useRef<HTMLElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadTargetRef = useRef<UploadTarget | null>(null);

  useEffect(() => { contentRef.current = content; }, [content]);

  const load = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    setError("");
    const { data, error: rpcError } = await supabase.rpc("site_editor_open", { p_slug: slug });
    if (rpcError) {
      setError(rpcError.message);
      setLoading(false);
      return;
    }
    const next = data as Workspace;
    setWorkspace(next);
    setContent(next.revision.content);
    setNote(next.revision.note || "");
    setValidation(next.validation || next.revision.validation || { ok: true, issues: [] });
    setDirty(false);
    setLoading(false);
  }, [slug]);

  useEffect(() => { void load(); }, [load]);

  const issues = useMemo(() => Array.isArray(validation.issues) ? validation.issues.map(String) : [], [validation]);
  const materialized = useMemo(() => content ? ({ ...content, pages: getBourdonPages(content) } as LabSite) : null, [content]);
  const editorBasePath = `/admin/sites/${encodeURIComponent(slug)}/edit`;

  function markDirty(next: LabSite) {
    contentRef.current = next;
    setContent(next);
    setDirty(true);
    setNotice("");
  }

  function updatePath(path: string, value: unknown) {
    const current = contentRef.current;
    if (!current) return;
    markDirty(applyStructuredChange(current, path, value));
  }

  function addVisualOverride(override: VisualOverride) {
    const current = contentRef.current;
    if (!current) return;
    markDirty(withOverride(current, override));
  }

  async function saveDraft(showNotice = true): Promise<boolean> {
    if (!workspace || !contentRef.current) return false;
    setSaving(true);
    setError("");
    const normalized = { ...contentRef.current, slug: workspace.site.slug };
    const { data, error: rpcError } = await supabase.rpc("site_editor_save", {
      p_revision_id: workspace.revision.id,
      p_content: normalized,
      p_note: note,
    });
    setSaving(false);
    if (rpcError) {
      setError(rpcError.message);
      return false;
    }
    contentRef.current = normalized;
    setContent(normalized);
    setValidation((data as any)?.validation || { ok: true, issues: [] });
    setDirty(false);
    if (showNotice) setNotice("Draft saved. The public website has not changed.");
    return true;
  }

  async function publishChanges() {
    if (!workspace || publishing) return;
    setPublishing(true);
    setNotice("");
    setError("");
    const saved = await saveDraft(false);
    if (!saved) { setPublishing(false); return; }
    const { data, error: rpcError } = await supabase.rpc("site_editor_publish", { p_revision_id: workspace.revision.id });
    if (rpcError) {
      setError(rpcError.message);
      setPublishing(false);
      return;
    }
    const result = data as any;
    if (!result?.ok) {
      const nextValidation = result?.validation || { ok: false, issues: result?.issues || ["Revision could not be published."] };
      setValidation(nextValidation);
      setError(result?.stale ? "The live site changed while this draft was open. Reset to Live before publishing." : "Fix the validation problems before publishing.");
      setModal("validation");
      setPublishing(false);
      return;
    }
    setNotice("Published. The previous live version was saved automatically in Revision History.");
    setPublishing(false);
    await load();
  }

  async function resetToLive() {
    if (!workspace) return;
    setSaving(true);
    setError("");
    const { data, error: rpcError } = await supabase.rpc("site_editor_reset_to_live", { p_revision_id: workspace.revision.id });
    setSaving(false);
    if (rpcError) { setError(rpcError.message); return; }
    const result = data as any;
    contentRef.current = result.content as LabSite;
    setContent(result.content as LabSite);
    setNote("");
    setValidation(result.validation || { ok: true, issues: [] });
    setDirty(false);
    setNotice("Draft reset to the current live website.");
    setModal(null);
  }

  async function useHistory(item: HistoryItem) {
    setRestoring(item.id);
    setError("");
    const { data, error: rpcError } = await supabase.rpc("site_editor_use_history", { p_history_id: item.id });
    setRestoring(null);
    if (rpcError) { setError(rpcError.message); return; }
    const result = data as any;
    contentRef.current = result.content as LabSite;
    setContent(result.content as LabSite);
    setValidation(result.validation || { ok: true, issues: [] });
    setNote(`Restore candidate from ${formatDate(item.publishedAt || item.createdAt)}`);
    setDirty(false);
    setNotice("Historical version loaded into the draft. Publish when you are satisfied.");
    setRoute({ section: "home" });
    setModal(null);
  }

  async function copyRepairBrief() {
    const text = [
      `Repair LabNarrative site: ${workspace?.site.slug || slug}`,
      `PI: ${contentRef.current?.piName || ""}`,
      `Current validation problems: ${issues.length ? issues.join("; ") : "none"}`,
      "Please inspect the visual Site Editor revision and repair only the identified problem without changing unrelated scientific content or design.",
    ].join("\n");
    await navigator.clipboard.writeText(text);
    setNotice("Repair brief copied for ChatGPT.");
  }

  function beginTextEdit(element: HTMLElement) {
    const root = canvasRef.current?.querySelector<HTMLElement>("[data-ln-visual-root]");
    const currentContent = contentRef.current;
    if (!root || !materialized || !currentContent) return;
    const selector = selectorFor(element, root);
    if (!selector) return;
    const key = element.closest("header,footer") ? "*" : routeKey(route);
    const existingOverride = visualOverrides(currentContent).find((item) => item.kind === "text" && item.selector === selector && (item.route === key || item.route === routeKey(route)));
    const original = element.innerText;
    const path = existingOverride ? undefined : findTextPath(materialized, route, element, original);
    let cancelled = false;

    element.contentEditable = "true";
    element.spellcheck = true;
    element.dataset.lnDirectEditing = "1";
    element.focus();
    const selection = window.getSelection();
    if (selection) {
      const range = document.createRange();
      range.selectNodeContents(element);
      selection.removeAllRanges();
      selection.addRange(range);
    }

    const finish = () => {
      element.removeEventListener("keydown", onKeyDown);
      delete element.dataset.lnDirectEditing;
      element.contentEditable = "false";
      if (cancelled) {
        element.innerText = original;
        return;
      }
      const value = element.innerText.replace(/\u00a0/g, " ").trim();
      if (path) updatePath(path, value);
      else addVisualOverride({ route: key, selector, kind: "text", value });
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        cancelled = true;
        element.blur();
      } else if (event.key === "Enter" && !event.shiftKey && /^(H[1-6]|A|SPAN|STRONG|B)$/.test(element.tagName)) {
        event.preventDefault();
        element.blur();
      }
    };

    element.addEventListener("keydown", onKeyDown);
    element.addEventListener("blur", finish, { once: true });
  }

  function beginImageEdit(element: HTMLImageElement) {
    const root = canvasRef.current?.querySelector<HTMLElement>("[data-ln-visual-root]");
    if (!root || !materialized) return;
    const selector = selectorFor(element, root);
    const key = element.closest("header,footer") ? "*" : routeKey(route);
    const path = findImagePath(materialized, route, element, element.currentSrc || element.src);
    const rect = element.getBoundingClientRect();
    const target: ImageTarget = {
      element,
      selector,
      route: key,
      path,
      value: path ? String(getAtPath(materialized, path) || element.currentSrc || element.src) : (element.currentSrc || element.src),
      x: Math.max(12, Math.min(window.innerWidth - 330, rect.left + 12)),
      y: Math.max(12, Math.min(window.innerHeight - 190, rect.top + 12)),
    };
    setImageTarget(target);
    setImageUrl(target.value);
  }

  function canvasClick(event: MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    const root = canvasRef.current?.querySelector<HTMLElement>("[data-ln-visual-root]");
    if (!root || !root.contains(target)) return;

    if (editMode) {
      const image = target.closest("img");
      if (image instanceof HTMLImageElement) {
        event.preventDefault();
        event.stopPropagation();
        beginImageEdit(image);
        return;
      }
      const editable = editableTextElement(target, root);
      if (editable) {
        event.preventDefault();
        event.stopPropagation();
        beginTextEdit(editable);
        return;
      }
    }

    const anchor = target.closest("a");
    if (!anchor) return;
    const href = anchor.getAttribute("href");
    if (!href) return;
    const nextRoute = routeFromEditorHref(href, editorBasePath);
    if (nextRoute) {
      event.preventDefault();
      setRoute(nextRoute);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function canvasHover(event: MouseEvent<HTMLDivElement>) {
    if (!editMode) return;
    const target = event.target as HTMLElement;
    const root = canvasRef.current?.querySelector<HTMLElement>("[data-ln-visual-root]");
    if (!root || !root.contains(target)) return;
    const image = target.closest("img");
    const next = image instanceof HTMLImageElement ? image : editableTextElement(target, root);
    if (hoverRef.current && hoverRef.current !== next) delete hoverRef.current.dataset.lnHoverEdit;
    if (next) {
      next.dataset.lnHoverEdit = "1";
      hoverRef.current = next;
    }
  }

  function clearHover() {
    if (hoverRef.current) delete hoverRef.current.dataset.lnHoverEdit;
    hoverRef.current = null;
  }

  function applyImageUrl(target: ImageTarget, value: string) {
    if (target.path) updatePath(target.path, value);
    else addVisualOverride({ route: target.route, selector: target.selector, kind: "image", value });
    setImageTarget(null);
  }

  function chooseUpload(target: UploadTarget) {
    uploadTargetRef.current = target;
    fileInputRef.current?.click();
  }

  async function uploadImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    const target = uploadTargetRef.current;
    uploadTargetRef.current = null;
    if (!file || !target) return;
    if (!file.type.startsWith("image/")) { setError("Choose a JPG, PNG, WebP or GIF image."); return; }
    if (file.size > MAX_IMAGE_SIZE_BYTES) { setError("The image must be smaller than 25 MB."); return; }
    setUploading(true);
    setError("");
    const path = `${safeSegment(slug)}/visual-editor/${Date.now()}-${crypto.randomUUID()}.${fileExtension(file)}`;
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, { cacheControl: "31536000", contentType: file.type, upsert: false });
    if (uploadError) {
      setError(uploadError.message);
      setUploading(false);
      return;
    }
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    if ("path" in target) updatePath(target.path, data.publicUrl);
    else addVisualOverride({ route: target.route, selector: target.selector, kind: "image", value: data.publicUrl });
    setImageTarget(null);
    setUploading(false);
    setNotice("Image added to the draft. Save when ready.");
  }

  function addItem(kind: ManagedCollection) {
    const current = contentRef.current;
    if (!current) return;
    const next = structuredClone(current);
    if (kind === "research") {
      next.research = [...(next.research || []), { slug: `research-programme-${(next.research?.length || 0) + 1}`, title: "New research programme", summary: "Click to describe this research programme.", question: "", body: [] }];
      next.projects = [...(next.projects || []), { title: "New research programme", description: "Click to describe this research programme." }];
      setRoute({ section: "research" });
    } else if (kind === "members") {
      next.members = [...(next.members || []), { name: "New lab member", role: "Role", bio: "", image: "", href: "" }];
      next.team = [...(next.team || []), { name: "New lab member", role: "Role" }];
      setRoute({ section: "members" });
    } else if (kind === "publications") {
      next.publications = [...(next.publications || []), { title: "New publication", journal: "Journal", year: String(new Date().getFullYear()), href: "" }];
      setRoute({ section: "publications" });
    } else {
      next.opportunities = [...(next.opportunities || []), { title: "New opportunity", status: "", description: "Click to describe this opportunity.", linkLabel: "", href: "" }];
      setRoute({ section: "join" });
    }
    markDirty(next);
    setModal(null);
    setNotice("New item added to the draft. Click its text on the website to edit it.");
  }

  function collectionItems(kind: ManagedCollection): any[] {
    const current = contentRef.current;
    if (!current) return [];
    if (kind === "research") return current.research || [];
    if (kind === "members") return current.members || [];
    if (kind === "publications") return current.publications || [];
    return current.opportunities || [];
  }

  function collectionTitle(kind: ManagedCollection, item: any, index: number) {
    if (kind === "research") return item.title || `Research programme ${index + 1}`;
    if (kind === "members") return item.name || `Lab member ${index + 1}`;
    if (kind === "publications") return item.title || `Publication ${index + 1}`;
    return item.title || `Opportunity ${index + 1}`;
  }

  function moveItem(kind: ManagedCollection, index: number, direction: -1 | 1) {
    const current = contentRef.current;
    if (!current) return;
    const target = index + direction;
    const items = collectionItems(kind);
    if (target < 0 || target >= items.length) return;
    const next = structuredClone(current);
    const key = kind as keyof LabSite;
    const reordered = [...items];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(target, 0, moved);
    (next as any)[key] = reordered;
    if (kind === "research") next.projects = reordered.map((item: any) => ({ title: item.title || "", description: item.summary || "" }));
    if (kind === "members") next.team = reordered.map((item: any) => ({ name: item.name || "", role: item.role || "" }));
    markDirty(next);
  }

  function removeItem(kind: ManagedCollection, index: number) {
    const current = contentRef.current;
    if (!current) return;
    const next = structuredClone(current);
    const items = collectionItems(kind).filter((_, itemIndex) => itemIndex !== index);
    (next as any)[kind] = items;
    if (kind === "research") next.projects = items.map((item: any) => ({ title: item.title || "", description: item.summary || "" }));
    if (kind === "members") next.team = items.map((item: any) => ({ name: item.name || "", role: item.role || "" }));
    markDirty(next);
  }

  function imagePathForCollection(kind: ManagedCollection, index: number) {
    if (kind === "research") return `research.${index}.figureImage`;
    if (kind === "members") return `members.${index}.image`;
    return null;
  }

  if (loading) return <main className={styles.statePage}>Preparing the visual draft editor…</main>;
  if (error && !workspace) return <main className={styles.statePage}><section className={styles.stateCard}><h1>Visual Site Editor could not open.</h1><p>{error}</p><Link href="/admin/sites">Return to Website Monitor</Link></section></main>;
  if (!workspace || !content || !materialized) return null;

  const overrides = visualOverrides(content);
  const publicUrl = workspace.site.domainUrl || `https://${workspace.site.slug}.labnarrative.com`;

  return (
    <main className={styles.page}>
      <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={(event) => void uploadImage(event)} />

      <div className={styles.draftBadge}>
        <strong>Visual Draft Editor</strong>
        <span>{editMode ? "Click text or images to edit" : "Browse mode"}</span>
      </div>

      {notice ? <div className={styles.toastGood}>{notice}</div> : null}
      {error ? <div className={styles.toastBad}>{error}</div> : null}

      <div
        className={`${styles.canvas} ${editMode ? styles.canvasEditing : ""}`}
        ref={canvasRef}
        onClickCapture={canvasClick}
        onMouseOverCapture={canvasHover}
        onMouseLeave={clearHover}
      >
        <VisualOverridesHost site={content} route={route}>
          <SiteShell site={content} route={route} basePath={editorBasePath} previewMode={false} />
        </VisualOverridesHost>
      </div>

      {imageTarget ? (
        <div className={styles.imagePopover} style={{ left: imageTarget.x, top: imageTarget.y }}>
          <strong>Edit image</strong>
          <input value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} placeholder="Image URL" />
          <div>
            <button type="button" onClick={() => applyImageUrl(imageTarget, imageUrl)}>Apply URL</button>
            <button type="button" onClick={() => chooseUpload(imageTarget.path ? { path: imageTarget.path } : { selector: imageTarget.selector, route: imageTarget.route })} disabled={uploading}>{uploading ? "Uploading…" : "Replace"}</button>
            <button type="button" className={styles.dangerButton} onClick={() => applyImageUrl(imageTarget, "")}>Remove</button>
            <button type="button" onClick={() => setImageTarget(null)}>Cancel</button>
          </div>
        </div>
      ) : null}

      <nav className={styles.dock} aria-label="Visual editor controls">
        <Link className={styles.dockLink} href="/admin/sites">← Monitor</Link>
        <div className={styles.pageTabs}>
          {pageOrder.map((page) => <button key={page.section} type="button" className={route.section === page.section ? styles.activePage : ""} onClick={() => { setRoute({ section: page.section }); window.scrollTo({ top: 0, behavior: "smooth" }); }}>{page.label}</button>)}
        </div>
        <button type="button" className={editMode ? styles.editOn : ""} onClick={() => setEditMode((value) => !value)}>{editMode ? "Editing on" : "Browse"}</button>
        <button type="button" onClick={() => setModal("add")}>+ Add</button>
        <button type="button" onClick={() => setModal("manage")}>Manage</button>
        <button type="button" onClick={() => setModal("settings")}>Settings</button>
        <button type="button" onClick={() => setModal("history")}>History</button>
        <span className={`${styles.saveState} ${dirty ? styles.unsaved : ""}`}>{dirty ? "Unsaved" : issues.length ? `${issues.length} issue${issues.length === 1 ? "" : "s"}` : "Saved"}</span>
        <button type="button" onClick={() => void saveDraft()} disabled={saving || publishing}>{saving ? "Saving…" : "Save draft"}</button>
        <button className={styles.publishButton} type="button" onClick={() => void publishChanges()} disabled={saving || publishing}>{publishing ? "Publishing…" : "Publish"}</button>
      </nav>

      {modal === "add" ? <ModalShell title="Add to this website" subtitle="New content appears in the draft first." onClose={() => setModal(null)}><div className={styles.addGrid}><button onClick={() => addItem("research")}><strong>Research programme</strong><span>Add another programme or research line.</span></button><button onClick={() => addItem("members")}><strong>Lab member</strong><span>Add a person and optional photo.</span></button><button onClick={() => addItem("publications")}><strong>Publication</strong><span>Add a publication row.</span></button><button onClick={() => addItem("opportunities")}><strong>Opportunity</strong><span>Add a position or collaboration opportunity.</span></button><button onClick={() => chooseUpload({ path: "pages.home.piImage" })}><strong>PI portrait</strong><span>Add or replace the principal investigator portrait.</span></button><button onClick={() => chooseUpload({ path: "heroImage" })}><strong>Website image</strong><span>Upload a general site image. Existing visible images can also be clicked directly.</span></button></div></ModalShell> : null}

      {modal === "manage" ? <ModalShell title="Manage website content" subtitle="Reorder, remove, or add content. All changes remain in the draft." onClose={() => setModal(null)}><div className={styles.manageGroups}>{(["research","members","publications","opportunities"] as ManagedCollection[]).map((kind) => <section className={styles.manageGroup} key={kind}><header><h3>{kind === "research" ? "Research programmes" : kind === "members" ? "Lab members" : kind === "publications" ? "Publications" : "Opportunities"}</h3><button type="button" onClick={() => addItem(kind)}>+ Add</button></header>{collectionItems(kind).length ? <div className={styles.manageList}>{collectionItems(kind).map((item, index) => { const imagePath = imagePathForCollection(kind, index); return <article key={`${kind}-${index}`}><span>{collectionTitle(kind, item, index)}</span><div>{imagePath ? <button type="button" onClick={() => chooseUpload({ path: imagePath })}>{String(getAtPath(content, imagePath) || "").trim() ? "Replace image" : "Add image"}</button> : null}<button type="button" disabled={index === 0} onClick={() => moveItem(kind,index,-1)}>↑</button><button type="button" disabled={index === collectionItems(kind).length - 1} onClick={() => moveItem(kind,index,1)}>↓</button><button type="button" className={styles.dangerText} onClick={() => removeItem(kind,index)}>Remove</button></div></article>; })}</div> : <p className={styles.emptyText}>Nothing here yet.</p>}</section>)}</div></ModalShell> : null}

      {modal === "settings" ? <ModalShell title="Website settings" subtitle="Use direct editing for visible copy. These controls cover global details, navigation, style, revision notes and design-only overrides." onClose={() => setModal(null)}><div className={styles.settingsSections}><section><h3>Laboratory details</h3><div className={styles.settingsGrid}><SettingField label="Laboratory name" value={String(content.labName || "")} onChange={(value) => updatePath("labName", value)} /><SettingField label="Principal investigator" value={String(content.piName || "")} onChange={(value) => updatePath("piName", value)} /><SettingField label="Academic title" value={String(content.title || "")} onChange={(value) => updatePath("title", value)} /><SettingField label="Institution" value={String(content.institution || "")} onChange={(value) => updatePath("institution", value)} /><SettingField label="Department" value={String(content.department || "")} onChange={(value) => updatePath("department", value)} /><SettingField label="Email" type="email" value={String(content.email || "")} onChange={(value) => updatePath("email", value)} /><SettingField label="Phone" value={String(content.phone || "")} onChange={(value) => updatePath("phone", value)} /><SettingField label="Official profile" type="url" value={String(content.profileUrl || "")} onChange={(value) => updatePath("profileUrl", value)} /><SettingField label="PubMed URL" type="url" value={String(content.pubmedUrl || "")} onChange={(value) => updatePath("pubmedUrl", value)} /><SettingField label="Address" value={String(content.address || "")} onChange={(value) => updatePath("address", value)} wide /></div></section><section><h3>Navigation</h3><div className={styles.settingsGrid}>{Object.entries(getBourdonPages(content).navigation).map(([key,value]) => <SettingField key={key} label={key[0].toUpperCase()+key.slice(1)} value={String(value)} onChange={(next) => updatePath(`pages.navigation.${key}`, next)} />)}</div></section><section><h3>Theme</h3><div className={styles.colorGrid}>{(["background","surface","foreground","muted","accent"] as const).map((key) => <SettingField key={key} label={key[0].toUpperCase()+key.slice(1)} type="color" value={content.theme?.[key] || "#ffffff"} onChange={(value) => updatePath(`theme.${key}`, value)} />)}</div></section><section><h3>Revision note</h3><textarea className={styles.noteArea} rows={4} value={note} onChange={(event) => { setNote(event.target.value); setDirty(true); }} placeholder="What changed and why?" /></section><section><h3>Design-only edits</h3><p className={styles.helperText}>These are direct edits to labels or images that are built into the current design rather than stored as ordinary site content.</p>{overrides.length ? <div className={styles.overrideList}>{overrides.map((item,index) => <article key={`${item.route}-${item.selector}-${item.kind}-${index}`}><div><strong>{item.kind === "image" ? "Image override" : item.kind === "hidden" ? "Hidden element" : "Text override"}</strong><span>{item.route === "*" ? "All pages" : item.route}</span><p>{item.kind === "text" ? item.value : item.value ? "Custom image" : "Image removed"}</p></div><button type="button" onClick={() => { const current = contentRef.current; if (current) markDirty(withoutOverride(current,index)); }}>Restore original</button></article>)}</div> : <p className={styles.emptyText}>No design-only edits.</p>}</section><section className={styles.safetySection}><h3>Draft safety</h3><div><button type="button" onClick={() => void resetToLive()}>Reset draft to current live site</button>{["concept","live"].includes(workspace.site.status) ? <a href={publicUrl} target="_blank" rel="noreferrer">Open published site ↗</a> : null}</div></section></div></ModalShell> : null}

      {modal === "history" ? <ModalShell title="Revision history" subtitle="Loading a previous version only changes this draft until you publish it." onClose={() => setModal(null)}>{workspace.history.length ? <div className={styles.historyList}>{workspace.history.map((item) => <article key={item.id}><div><strong>{item.status === "snapshot" ? "Previous live version" : "Published revision"}</strong><span>{formatDate(item.publishedAt || item.createdAt)}</span>{item.note ? <p>{item.note}</p> : null}</div><button type="button" onClick={() => void useHistory(item)} disabled={Boolean(restoring)}>{restoring === item.id ? "Loading…" : "Use as draft"}</button></article>)}</div> : <p className={styles.emptyText}>No published revisions yet. The first publish from this editor will create the first rollback snapshot automatically.</p>}</ModalShell> : null}

      {modal === "validation" ? <ModalShell title={issues.length ? "Validation problems" : "Draft is valid"} subtitle={issues.length ? "Fix these before publishing." : "The renderer contract currently passes."} onClose={() => setModal(null)}>{issues.length ? <ul className={styles.issueList}>{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul> : <p className={styles.emptyText}>No validation problems.</p>}<button className={styles.copyButton} type="button" onClick={() => void copyRepairBrief()}>Copy ChatGPT repair brief</button></ModalShell> : null}
    </main>
  );
}
