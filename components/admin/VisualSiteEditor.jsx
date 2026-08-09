"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SiteShell from "@/components/SiteShell";
import VisualOverridesHost from "@/components/VisualOverridesHost";
import { browserSupabase as supabase } from "@/lib/supabase-browser";
import { getBourdonPages } from "@/lib/sites";
import styles from "./visual-site-editor.module.css";

const BUCKET = "labnarrative-images";
const MAX_IMAGE_SIZE_BYTES = 25 * 1024 * 1024;
const PAGES = [
  ["home", "Home"],
  ["research", "Research"],
  ["members", "Members"],
  ["publications", "Publications"],
  ["join", "Join"],
  ["contact", "Contact"],
];

const COLLECTIONS = ["research", "members", "publications", "opportunities"];

function formatDate(value) {
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

function routeKey(route) {
  return `${route.section}${route.projectSlug ? `:${route.projectSlug}` : ""}`;
}

function safeSegment(value) {
  return value.toLowerCase().trim().replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "draft";
}

function fileExtension(file) {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext && /^[a-z0-9]+$/.test(ext)) return ext;
  return { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" }[file.type] || "jpg";
}

function normalizeText(value) {
  return String(value || "").replace(/[→↗←]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

function isUrlLike(value) {
  return /^(https?:\/\/|mailto:|tel:)/i.test(String(value || "").trim());
}

function collectStrings(value, path = "", output = []) {
  if (typeof value === "string") {
    if (path && !path.startsWith("visualOverrides")) output.push({ path, value });
    return output;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectStrings(item, path ? `${path}.${index}` : String(index), output));
    return output;
  }
  if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, item]) => collectStrings(item, path ? `${path}.${key}` : key, output));
  }
  return output;
}

function getAtPath(value, path) {
  return path.split(".").reduce((current, key) => {
    if (current == null) return undefined;
    return Array.isArray(current) ? current[Number(key)] : current[key];
  }, value);
}

function setAtPath(value, path, nextValue) {
  const clone = structuredClone(value);
  const keys = path.split(".");
  let current = clone;
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

function applyStructuredChange(site, path, value) {
  let next = setAtPath(site, path, value);
  let match = path.match(/^research\.(\d+)\.(title|summary)$/);
  if (match) {
    const [, index, key] = match;
    next = setAtPath(next, `projects.${index}.${key === "title" ? "title" : "description"}`, value);
  }
  match = path.match(/^projects\.(\d+)\.(title|description)$/);
  if (match) {
    const [, index, key] = match;
    if (next.research?.[Number(index)]) next = setAtPath(next, `research.${index}.${key === "title" ? "title" : "summary"}`, value);
  }
  match = path.match(/^members\.(\d+)\.(name|role)$/);
  if (match) {
    const [, index, key] = match;
    next = setAtPath(next, `team.${index}.${key}`, value);
  }
  match = path.match(/^team\.(\d+)\.(name|role)$/);
  if (match) {
    const [, index, key] = match;
    if (next.members?.[Number(index)]) next = setAtPath(next, `members.${index}.${key}`, value);
  }
  return next;
}

function overrides(site) {
  return Array.isArray(site?.visualOverrides) ? site.visualOverrides.filter(Boolean) : [];
}

function withOverride(site, override) {
  const next = overrides(site).filter((item) => !(item.route === override.route && item.selector === override.selector && item.kind === override.kind));
  return { ...site, visualOverrides: [...next, override] };
}

function selectorFor(element, root) {
  const parts = [];
  let current = element;
  while (current && current !== root) {
    const parentElement = current.parentElement;
    if (!parentElement) break;
    const tag = current.tagName.toLowerCase();
    const siblings = Array.from(parentElement.children).filter((item) => item.tagName === current.tagName);
    const index = siblings.indexOf(current) + 1;
    parts.unshift(siblings.length > 1 ? `${tag}:nth-of-type(${index})` : tag);
    current = parentElement;
  }
  return parts.join(" > ");
}

function scorePath(path, route, element) {
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

function findTextPath(materialized, route, element, text) {
  const normalized = normalizeText(text);
  if (!normalized) return undefined;
  return collectStrings(materialized)
    .filter((entry) => !isUrlLike(entry.value) && normalizeText(entry.value) === normalized)
    .map((entry) => ({ ...entry, score: scorePath(entry.path, route, element) + (entry.value.trim() === text.trim() ? 10 : 0) }))
    .sort((a, b) => b.score - a.score)[0]?.path;
}

function normalizeImageUrl(value) {
  try { return new URL(value, window.location.origin).toString(); } catch { return String(value || ""); }
}

function findImagePath(materialized, route, element, src) {
  const normalized = normalizeImageUrl(src);
  return collectStrings(materialized)
    .filter((entry) => isUrlLike(entry.value) || /\.(png|jpe?g|webp|gif|svg)(\?|$)/i.test(entry.value))
    .filter((entry) => normalizeImageUrl(entry.value) === normalized)
    .map((entry) => ({ ...entry, score: scorePath(entry.path, route, element) + (entry.path.toLowerCase().includes("image") ? 20 : 0) }))
    .sort((a, b) => b.score - a.score)[0]?.path;
}

function editableTextElement(target, root) {
  let current = target;
  while (current && current !== root) {
    const tag = current.tagName?.toLowerCase?.();
    if (["h1","h2","h3","h4","h5","h6","p","span","strong","b","figcaption","a"].includes(tag) && String(current.innerText || "").trim()) return current;
    if (tag === "div" && current.children.length === 0 && String(current.innerText || "").trim()) return current;
    current = current.parentElement;
  }
  return null;
}

function routeFromHref(href, basePath) {
  try {
    const url = new URL(href, window.location.origin);
    if (!url.pathname.startsWith(basePath)) return null;
    const parts = url.pathname.slice(basePath.length).split("/").filter(Boolean);
    const alias = { home:"home", research:"research", members:"members", team:"members", publications:"publications", join:"join", opportunities:"join", contact:"contact" };
    const section = alias[parts[0] || "home"] || "home";
    return { section, projectSlug: section === "research" ? parts[1] : undefined };
  } catch { return null; }
}

function Field({ label, value, onChange, type = "text", wide = false }) {
  return <label className={wide ? styles.settingWide : styles.settingField}><span>{label}</span><input type={type} value={value} onChange={(e) => onChange(e.target.value)} /></label>;
}

function Modal({ title, subtitle, onClose, children }) {
  return <div className={styles.modalBackdrop} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}><section className={styles.modal}><header><div><h2>{title}</h2>{subtitle ? <p>{subtitle}</p> : null}</div><button type="button" onClick={onClose}>Close</button></header><div className={styles.modalBody}>{children}</div></section></div>;
}

export default function VisualSiteEditor({ slug }) {
  const [workspace, setWorkspace] = useState(null);
  const [content, setContent] = useState(null);
  const contentRef = useRef(null);
  const [note, setNote] = useState("");
  const [route, setRoute] = useState({ section: "home" });
  const [validation, setValidation] = useState({ ok: true, issues: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [restoring, setRestoring] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [modal, setModal] = useState(null);
  const [editMode, setEditMode] = useState(true);
  const [imageTarget, setImageTarget] = useState(null);
  const [imageUrl, setImageUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const canvasRef = useRef(null);
  const hoverRef = useRef(null);
  const fileInputRef = useRef(null);
  const uploadTargetRef = useRef(null);

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
    setWorkspace(data);
    setContent(data.revision.content);
    contentRef.current = data.revision.content;
    setNote(data.revision.note || "");
    setValidation(data.validation || data.revision.validation || { ok: true, issues: [] });
    setDirty(false);
    setLoading(false);
  }, [slug]);

  useEffect(() => { void load(); }, [load]);

  const issues = useMemo(() => Array.isArray(validation?.issues) ? validation.issues.map(String) : [], [validation]);
  const materialized = useMemo(() => content ? { ...content, pages: getBourdonPages(content) } : null, [content]);
  const basePath = `/admin/sites/${encodeURIComponent(slug)}/edit`;

  function markDirty(next) {
    contentRef.current = next;
    setContent(next);
    setDirty(true);
    setNotice("");
  }

  function updatePath(path, value) {
    if (!contentRef.current) return;
    markDirty(applyStructuredChange(contentRef.current, path, value));
  }

  function addOverride(override) {
    if (!contentRef.current) return;
    markDirty(withOverride(contentRef.current, override));
  }

  async function saveDraft(showNotice = true) {
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
    if (rpcError) { setError(rpcError.message); return false; }
    contentRef.current = normalized;
    setContent(normalized);
    setValidation(data?.validation || { ok: true, issues: [] });
    setDirty(false);
    if (showNotice) setNotice("Draft saved. The published website has not changed.");
    return true;
  }

  async function publishChanges() {
    if (!workspace || publishing) return;
    setPublishing(true);
    setError("");
    const saved = await saveDraft(false);
    if (!saved) { setPublishing(false); return; }
    const { data, error: rpcError } = await supabase.rpc("site_editor_publish", { p_revision_id: workspace.revision.id });
    if (rpcError) { setError(rpcError.message); setPublishing(false); return; }
    if (!data?.ok) {
      setValidation(data?.validation || { ok: false, issues: data?.issues || ["Revision could not be published."] });
      setError(data?.stale ? "The live site changed while this draft was open. Reset to Live before publishing." : "Fix the validation problems before publishing.");
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
    contentRef.current = data.content;
    setContent(data.content);
    setNote("");
    setValidation(data.validation || { ok: true, issues: [] });
    setDirty(false);
    setNotice("Draft reset to the current live website.");
    setModal(null);
  }

  async function restore(item) {
    setRestoring(item.id);
    const { data, error: rpcError } = await supabase.rpc("site_editor_use_history", { p_history_id: item.id });
    setRestoring(null);
    if (rpcError) { setError(rpcError.message); return; }
    contentRef.current = data.content;
    setContent(data.content);
    setValidation(data.validation || { ok: true, issues: [] });
    setNote(`Restore candidate from ${formatDate(item.publishedAt || item.createdAt)}`);
    setDirty(false);
    setNotice("Historical version loaded into the draft. Publish when satisfied.");
    setRoute({ section: "home" });
    setModal(null);
  }

  function beginTextEdit(element) {
    const root = canvasRef.current?.querySelector("[data-ln-visual-root]");
    if (!root || !materialized || !contentRef.current) return;
    const selector = selectorFor(element, root);
    if (!selector) return;
    const key = element.closest("header,footer") ? "*" : routeKey(route);
    const existing = overrides(contentRef.current).find((item) => item.kind === "text" && item.selector === selector && (item.route === key || item.route === routeKey(route)));
    const original = element.innerText;
    const path = existing ? undefined : findTextPath(materialized, route, element, original);
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

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        cancelled = true;
        element.blur();
      } else if (event.key === "Enter" && !event.shiftKey && /^(H[1-6]|A|SPAN|STRONG|B)$/.test(element.tagName)) {
        event.preventDefault();
        element.blur();
      }
    };

    const finish = () => {
      element.removeEventListener("keydown", onKeyDown);
      delete element.dataset.lnDirectEditing;
      element.contentEditable = "false";
      if (cancelled) { element.innerText = original; return; }
      const value = element.innerText.replace(/\u00a0/g, " ").trim();
      if (path) updatePath(path, value);
      else addOverride({ route: key, selector, kind: "text", value });
    };

    element.addEventListener("keydown", onKeyDown);
    element.addEventListener("blur", finish, { once: true });
  }

  function beginImageEdit(element) {
    const root = canvasRef.current?.querySelector("[data-ln-visual-root]");
    if (!root || !materialized) return;
    const selector = selectorFor(element, root);
    const key = element.closest("header,footer") ? "*" : routeKey(route);
    const path = findImagePath(materialized, route, element, element.currentSrc || element.src);
    const rect = element.getBoundingClientRect();
    const target = {
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

  function canvasClick(event) {
    const target = event.target;
    const root = canvasRef.current?.querySelector("[data-ln-visual-root]");
    if (!root || !root.contains(target)) return;

    if (editMode) {
      const image = target.closest?.("img");
      if (image) {
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

    const anchor = target.closest?.("a");
    if (!anchor) return;
    const nextRoute = routeFromHref(anchor.getAttribute("href") || "", basePath);
    if (nextRoute) {
      event.preventDefault();
      setRoute(nextRoute);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function hover(event) {
    if (!editMode) return;
    const target = event.target;
    const root = canvasRef.current?.querySelector("[data-ln-visual-root]");
    if (!root || !root.contains(target)) return;
    const image = target.closest?.("img");
    const next = image || editableTextElement(target, root);
    if (hoverRef.current && hoverRef.current !== next) delete hoverRef.current.dataset.lnHoverEdit;
    if (next) { next.dataset.lnHoverEdit = "1"; hoverRef.current = next; }
  }

  function clearHover() {
    if (hoverRef.current) delete hoverRef.current.dataset.lnHoverEdit;
    hoverRef.current = null;
  }

  function applyImage(value) {
    if (!imageTarget) return;
    if (imageTarget.path) updatePath(imageTarget.path, value);
    else addOverride({ route: imageTarget.route, selector: imageTarget.selector, kind: "image", value });
    setImageTarget(null);
  }

  function chooseUpload(target) {
    uploadTargetRef.current = target;
    fileInputRef.current?.click();
  }

  async function uploadImage(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    const target = uploadTargetRef.current;
    uploadTargetRef.current = null;
    if (!file || !target) return;
    if (!file.type.startsWith("image/")) { setError("Choose a JPG, PNG, WebP or GIF image."); return; }
    if (file.size > MAX_IMAGE_SIZE_BYTES) { setError("The image must be smaller than 25 MB."); return; }
    setUploading(true);
    const storagePath = `${safeSegment(slug)}/visual-editor/${Date.now()}-${crypto.randomUUID()}.${fileExtension(file)}`;
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, file, { cacheControl: "31536000", contentType: file.type, upsert: false });
    if (uploadError) { setError(uploadError.message); setUploading(false); return; }
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
    if (target.path) updatePath(target.path, data.publicUrl);
    else addOverride({ route: target.route, selector: target.selector, kind: "image", value: data.publicUrl });
    setImageTarget(null);
    setUploading(false);
    setNotice("Image added to the draft. Save when ready.");
  }

  function addItem(kind) {
    if (!contentRef.current) return;
    const next = structuredClone(contentRef.current);
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
    setNotice("New item added. Click its text directly on the website to edit it.");
  }

  function items(kind) {
    if (!contentRef.current) return [];
    if (kind === "research") return contentRef.current.research || [];
    if (kind === "members") return contentRef.current.members || [];
    if (kind === "publications") return contentRef.current.publications || [];
    return contentRef.current.opportunities || [];
  }

  function itemTitle(kind, item, index) {
    if (kind === "members") return item.name || `Lab member ${index + 1}`;
    return item.title || `${kind} ${index + 1}`;
  }

  function moveItem(kind, index, direction) {
    if (!contentRef.current) return;
    const list = items(kind);
    const target = index + direction;
    if (target < 0 || target >= list.length) return;
    const next = structuredClone(contentRef.current);
    const reordered = [...list];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(target, 0, moved);
    next[kind] = reordered;
    if (kind === "research") next.projects = reordered.map((item) => ({ title: item.title || "", description: item.summary || "" }));
    if (kind === "members") next.team = reordered.map((item) => ({ name: item.name || "", role: item.role || "" }));
    markDirty(next);
  }

  function removeItem(kind, index) {
    if (!contentRef.current) return;
    const next = structuredClone(contentRef.current);
    const filtered = items(kind).filter((_, i) => i !== index);
    next[kind] = filtered;
    if (kind === "research") next.projects = filtered.map((item) => ({ title: item.title || "", description: item.summary || "" }));
    if (kind === "members") next.team = filtered.map((item) => ({ name: item.name || "", role: item.role || "" }));
    markDirty(next);
  }

  function imagePath(kind, index) {
    if (kind === "research") return `research.${index}.figureImage`;
    if (kind === "members") return `members.${index}.image`;
    return null;
  }

  if (loading) return <main className={styles.statePage}>Preparing the visual draft editor…</main>;
  if (error && !workspace) return <main className={styles.statePage}><section className={styles.stateCard}><h1>Visual Site Editor could not open.</h1><p>{error}</p><Link href="/admin/sites">Return to Website Monitor</Link></section></main>;
  if (!workspace || !content || !materialized) return null;

  const allOverrides = overrides(content);
  const publicUrl = workspace.site.domainUrl || `https://${workspace.site.slug}.labnarrative.com`;

  return (
    <main className={styles.page}>
      <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={(event) => void uploadImage(event)} />

      <div className={styles.draftBadge}><strong>Visual Draft Editor</strong><span>{editMode ? "Click text or images to edit" : "Browse mode"}</span></div>
      {notice ? <div className={styles.toastGood}>{notice}</div> : null}
      {error ? <div className={styles.toastBad}>{error}</div> : null}

      <div className={`${styles.canvas} ${editMode ? styles.canvasEditing : ""}`} ref={canvasRef} onClickCapture={canvasClick} onMouseOverCapture={hover} onMouseLeave={clearHover}>
        <VisualOverridesHost site={content} route={route}>
          <SiteShell site={content} route={route} basePath={basePath} previewMode={false} />
        </VisualOverridesHost>
      </div>

      {imageTarget ? <div className={styles.imagePopover} style={{ left: imageTarget.x, top: imageTarget.y }}><strong>Edit image</strong><input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="Image URL" /><div><button type="button" onClick={() => applyImage(imageUrl)}>Apply URL</button><button type="button" onClick={() => chooseUpload(imageTarget.path ? { path: imageTarget.path } : { selector: imageTarget.selector, route: imageTarget.route })} disabled={uploading}>{uploading ? "Uploading…" : "Replace"}</button><button type="button" className={styles.dangerButton} onClick={() => applyImage("")}>Remove</button><button type="button" onClick={() => setImageTarget(null)}>Cancel</button></div></div> : null}

      <nav className={styles.dock} aria-label="Visual editor controls">
        <Link className={styles.dockLink} href="/admin/sites">← Monitor</Link>
        <div className={styles.pageTabs}>{PAGES.map(([section,label]) => <button key={section} type="button" className={route.section === section ? styles.activePage : ""} onClick={() => { setRoute({ section }); window.scrollTo({ top: 0, behavior: "smooth" }); }}>{label}</button>)}</div>
        <button type="button" className={editMode ? styles.editOn : ""} onClick={() => setEditMode((value) => !value)}>{editMode ? "Editing on" : "Browse"}</button>
        <button type="button" onClick={() => setModal("add")}>+ Add</button>
        <button type="button" onClick={() => setModal("manage")}>Manage</button>
        <button type="button" onClick={() => setModal("settings")}>Settings</button>
        <button type="button" onClick={() => setModal("history")}>History</button>
        <span className={`${styles.saveState} ${dirty ? styles.unsaved : ""}`}>{dirty ? "Unsaved" : issues.length ? `${issues.length} issue${issues.length === 1 ? "" : "s"}` : "Saved"}</span>
        <button type="button" onClick={() => void saveDraft()} disabled={saving || publishing}>{saving ? "Saving…" : "Save draft"}</button>
        <button className={styles.publishButton} type="button" onClick={() => void publishChanges()} disabled={saving || publishing}>{publishing ? "Publishing…" : "Publish"}</button>
      </nav>

      {modal === "add" ? <Modal title="Add to this website" subtitle="New content appears in the draft first." onClose={() => setModal(null)}><div className={styles.addGrid}><button onClick={() => addItem("research")}><strong>Research programme</strong><span>Add another programme or research line.</span></button><button onClick={() => addItem("members")}><strong>Lab member</strong><span>Add a person and optional photo.</span></button><button onClick={() => addItem("publications")}><strong>Publication</strong><span>Add a publication row.</span></button><button onClick={() => addItem("opportunities")}><strong>Opportunity</strong><span>Add a position or collaboration opportunity.</span></button><button onClick={() => chooseUpload({ path: "pages.home.piImage" })}><strong>PI portrait</strong><span>Add or replace the principal investigator portrait.</span></button><button onClick={() => chooseUpload({ path: "heroImage" })}><strong>Website image</strong><span>Upload a general site image. Visible images can also be clicked directly.</span></button></div></Modal> : null}

      {modal === "manage" ? <Modal title="Manage website content" subtitle="Reorder, remove, or add content. All changes remain in the draft." onClose={() => setModal(null)}><div className={styles.manageGroups}>{COLLECTIONS.map((kind) => <section className={styles.manageGroup} key={kind}><header><h3>{kind === "research" ? "Research programmes" : kind === "members" ? "Lab members" : kind === "publications" ? "Publications" : "Opportunities"}</h3><button type="button" onClick={() => addItem(kind)}>+ Add</button></header>{items(kind).length ? <div className={styles.manageList}>{items(kind).map((item,index) => { const path = imagePath(kind,index); return <article key={`${kind}-${index}`}><span>{itemTitle(kind,item,index)}</span><div>{path ? <button type="button" onClick={() => chooseUpload({ path })}>{String(getAtPath(content,path) || "").trim() ? "Replace image" : "Add image"}</button> : null}<button type="button" disabled={index === 0} onClick={() => moveItem(kind,index,-1)}>↑</button><button type="button" disabled={index === items(kind).length - 1} onClick={() => moveItem(kind,index,1)}>↓</button><button type="button" className={styles.dangerText} onClick={() => removeItem(kind,index)}>Remove</button></div></article>; })}</div> : <p className={styles.emptyText}>Nothing here yet.</p>}</section>)}</div></Modal> : null}

      {modal === "settings" ? <Modal title="Website settings" subtitle="Use direct editing for visible copy. These controls cover global details, navigation, style, revision notes and design-only overrides." onClose={() => setModal(null)}><div className={styles.settingsSections}><section><h3>Laboratory details</h3><div className={styles.settingsGrid}><Field label="Laboratory name" value={String(content.labName || "")} onChange={(v) => updatePath("labName",v)} /><Field label="Principal investigator" value={String(content.piName || "")} onChange={(v) => updatePath("piName",v)} /><Field label="Academic title" value={String(content.title || "")} onChange={(v) => updatePath("title",v)} /><Field label="Institution" value={String(content.institution || "")} onChange={(v) => updatePath("institution",v)} /><Field label="Department" value={String(content.department || "")} onChange={(v) => updatePath("department",v)} /><Field label="Email" type="email" value={String(content.email || "")} onChange={(v) => updatePath("email",v)} /><Field label="Phone" value={String(content.phone || "")} onChange={(v) => updatePath("phone",v)} /><Field label="Official profile" type="url" value={String(content.profileUrl || "")} onChange={(v) => updatePath("profileUrl",v)} /><Field label="PubMed URL" type="url" value={String(content.pubmedUrl || "")} onChange={(v) => updatePath("pubmedUrl",v)} /><Field label="Address" value={String(content.address || "")} onChange={(v) => updatePath("address",v)} wide /></div></section><section><h3>Navigation</h3><div className={styles.settingsGrid}>{Object.entries(getBourdonPages(content).navigation).map(([key,value]) => <Field key={key} label={key[0].toUpperCase()+key.slice(1)} value={String(value)} onChange={(v) => updatePath(`pages.navigation.${key}`,v)} />)}</div></section><section><h3>Theme</h3><div className={styles.colorGrid}>{["background","surface","foreground","muted","accent"].map((key) => <Field key={key} label={key[0].toUpperCase()+key.slice(1)} type="color" value={content.theme?.[key] || "#ffffff"} onChange={(v) => updatePath(`theme.${key}`,v)} />)}</div></section><section><h3>Revision note</h3><textarea className={styles.noteArea} rows={4} value={note} onChange={(e) => { setNote(e.target.value); setDirty(true); }} placeholder="What changed and why?" /></section><section><h3>Design-only edits</h3><p className={styles.helperText}>These are direct edits to labels or images that are built into the current design rather than stored as ordinary site content.</p>{allOverrides.length ? <div className={styles.overrideList}>{allOverrides.map((item,index) => <article key={`${item.route}-${item.selector}-${item.kind}-${index}`}><div><strong>{item.kind === "image" ? "Image override" : item.kind === "hidden" ? "Hidden element" : "Text override"}</strong><span>{item.route === "*" ? "All pages" : item.route}</span><p>{item.kind === "text" ? item.value : item.value ? "Custom image" : "Image removed"}</p></div><button type="button" onClick={() => { const current = contentRef.current; if (current) markDirty({ ...current, visualOverrides: overrides(current).filter((_,i) => i !== index) }); }}>Restore original</button></article>)}</div> : <p className={styles.emptyText}>No design-only edits.</p>}</section><section className={styles.safetySection}><h3>Draft safety</h3><div><button type="button" onClick={() => void resetToLive()}>Reset draft to current live site</button>{["concept","live"].includes(workspace.site.status) ? <a href={publicUrl} target="_blank" rel="noreferrer">Open published site ↗</a> : null}</div></section></div></Modal> : null}

      {modal === "history" ? <Modal title="Revision history" subtitle="Loading a previous version only changes this draft until you publish it." onClose={() => setModal(null)}>{workspace.history.length ? <div className={styles.historyList}>{workspace.history.map((item) => <article key={item.id}><div><strong>{item.status === "snapshot" ? "Previous live version" : "Published revision"}</strong><span>{formatDate(item.publishedAt || item.createdAt)}</span>{item.note ? <p>{item.note}</p> : null}</div><button type="button" onClick={() => void restore(item)} disabled={Boolean(restoring)}>{restoring === item.id ? "Loading…" : "Use as draft"}</button></article>)}</div> : <p className={styles.emptyText}>No published revisions yet. The first publish from this editor will create the first rollback snapshot automatically.</p>}</Modal> : null}

      {modal === "validation" ? <Modal title={issues.length ? "Validation problems" : "Draft is valid"} subtitle={issues.length ? "Fix these before publishing." : "The renderer contract currently passes."} onClose={() => setModal(null)}>{issues.length ? <ul className={styles.issueList}>{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul> : <p className={styles.emptyText}>No validation problems.</p>}</Modal> : null}
    </main>
  );
}
