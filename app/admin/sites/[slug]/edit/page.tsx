"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import VisualSiteEditor from "@/components/admin/VisualSiteEditor";
import { browserSupabase as supabase } from "@/lib/supabase-browser";

export default function SiteEditorPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const slug = decodeURIComponent(String(params?.slug || ""));
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmSlug, setConfirmSlug] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  async function deleteWebsite() {
    if (!slug || confirmSlug !== slug || deleting) return;
    setDeleting(true);
    setDeleteError("");
    const { data, error } = await supabase.rpc("site_editor_archive", {
      p_slug: slug,
      p_confirm_slug: confirmSlug,
    });
    if (error) {
      setDeleteError(error.message);
      setDeleting(false);
      return;
    }
    if (!data?.ok) {
      setDeleteError(data?.confirmationMismatch ? `Type ${slug} exactly to confirm.` : data?.alreadyArchived ? "This website is already deleted/archived." : "The website could not be deleted.");
      setDeleting(false);
      return;
    }
    router.replace("/admin/sites");
    router.refresh();
  }

  return (
    <>
      <VisualSiteEditor slug={slug} />

      <button
        type="button"
        className="ln-delete-site-trigger"
        onClick={() => { setConfirmSlug(""); setDeleteError(""); setDeleteOpen(true); }}
      >
        Delete website
      </button>

      {deleteOpen ? (
        <div className="ln-delete-site-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !deleting) setDeleteOpen(false); }}>
          <section className="ln-delete-site-dialog" role="dialog" aria-modal="true" aria-labelledby="ln-delete-site-title">
            <h2 id="ln-delete-site-title">Delete website?</h2>
            <p>This removes the website from active/public use by archiving it. Revision history and linked LabNarrative records are preserved for safety.</p>
            <p className="ln-delete-site-warning">This is a destructive action. Type <strong>{slug}</strong> to confirm.</p>
            <input
              autoFocus
              value={confirmSlug}
              onChange={(event) => setConfirmSlug(event.target.value)}
              placeholder={slug}
              disabled={deleting}
              aria-label="Type website slug to confirm deletion"
            />
            {deleteError ? <p className="ln-delete-site-error">{deleteError}</p> : null}
            <div className="ln-delete-site-actions">
              <button type="button" className="ln-delete-site-cancel" onClick={() => setDeleteOpen(false)} disabled={deleting}>Cancel</button>
              <button type="button" className="ln-delete-site-confirm" onClick={() => void deleteWebsite()} disabled={confirmSlug !== slug || deleting}>{deleting ? "Deleting…" : "Delete website"}</button>
            </div>
          </section>
        </div>
      ) : null}

      <style jsx global>{`
        .ln-delete-site-trigger {
          position: fixed;
          right: 18px;
          bottom: 76px;
          z-index: 690;
          min-height: 38px;
          padding: 9px 13px;
          border: 1px solid #a83b43 !important;
          border-radius: 9px;
          background: #8e2932 !important;
          color: #ffffff !important;
          font: inherit;
          font-size: 11px;
          font-weight: 800;
          cursor: pointer;
          box-shadow: 0 8px 24px rgba(58, 10, 14, .24);
        }
        .ln-delete-site-trigger:hover { background: #a7333d !important; }

        .ln-delete-site-backdrop {
          position: fixed;
          inset: 0;
          z-index: 1000;
          display: grid;
          place-items: center;
          padding: 20px;
          background: rgba(5, 15, 21, .62);
          backdrop-filter: blur(8px);
        }
        .ln-delete-site-dialog {
          width: min(520px, 100%);
          padding: 28px;
          border: 1px solid #e0c4c7;
          border-radius: 18px;
          background: #ffffff !important;
          color: #1c2529 !important;
          box-shadow: 0 28px 90px rgba(0,0,0,.32);
        }
        .ln-delete-site-dialog h2 {
          margin: 0 0 12px;
          color: #711f27 !important;
          font: 700 34px/1.05 Arial, Helvetica, sans-serif;
          letter-spacing: -.035em;
        }
        .ln-delete-site-dialog p {
          margin: 0 0 14px;
          color: #48565b !important;
          font: 14px/1.6 Arial, Helvetica, sans-serif;
        }
        .ln-delete-site-dialog .ln-delete-site-warning { color: #711f27 !important; }
        .ln-delete-site-dialog strong { color: #711f27 !important; }
        .ln-delete-site-dialog input {
          width: 100%;
          box-sizing: border-box;
          margin: 4px 0 10px;
          padding: 12px 13px;
          border: 1px solid #c8b2b5 !important;
          border-radius: 9px;
          background: #ffffff !important;
          color: #171d20 !important;
          font: 600 14px/1.3 Arial, Helvetica, sans-serif;
          outline: none;
        }
        .ln-delete-site-dialog input:focus { border-color: #9c343d !important; box-shadow: 0 0 0 3px rgba(156,52,61,.12); }
        .ln-delete-site-dialog .ln-delete-site-error { margin-top: 4px; color: #a12631 !important; font-weight: 700; }
        .ln-delete-site-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px; }
        .ln-delete-site-actions button {
          min-height: 40px;
          padding: 9px 14px;
          border-radius: 9px;
          font: 800 12px Arial, Helvetica, sans-serif;
          cursor: pointer;
        }
        .ln-delete-site-actions button:disabled { opacity: .45; cursor: default; }
        .ln-delete-site-cancel { border: 1px solid #cbd3d5 !important; background: #ffffff !important; color: #253439 !important; }
        .ln-delete-site-confirm { border: 1px solid #9f3039 !important; background: #8e2932 !important; color: #ffffff !important; }
        .ln-delete-site-confirm:not(:disabled):hover { background: #a7333d !important; }

        /* Research editor accessibility mode: keep the website data and
           structure unchanged, but render Research on light surfaces with
           dark copy while editing. The published renderer is unaffected. */
        [data-ln-visual-root] .narita-route-research main,
        [data-ln-visual-root] .narita-route-research main > section,
        [data-ln-visual-root] .narita-route-research main > article,
        [data-ln-visual-root] .narita-route-research main > article > section,
        [data-ln-visual-root] .narita-route-research [class*="pageHero"],
        [data-ln-visual-root] .narita-route-research [class*="researchList"],
        [data-ln-visual-root] .narita-route-research [class*="researchList"] > a,
        [data-ln-visual-root] .narita-route-research [class*="researchListCopy"],
        [data-ln-visual-root] .narita-route-research [class*="projectQuestion"],
        [data-ln-visual-root] .narita-route-research [class*="projectNarrative"],
        [data-ln-visual-root] .narita-route-research [class*="detailList"] {
          background: #ffffff !important;
          background-color: #ffffff !important;
        }

        [data-ln-visual-root] .narita-route-research [class*="researchList"] > a {
          background: #f5f4f2 !important;
          background-color: #f5f4f2 !important;
        }

        [data-ln-visual-root] .narita-route-research [class*="pageHero"]::before,
        [data-ln-visual-root] .narita-route-research [class*="pageHero"]::after {
          background: #f5f4f2 !important;
        }

        [data-ln-visual-root] .narita-route-research [class*="pageHero"] > img {
          opacity: 0.08 !important;
        }

        [data-ln-visual-root] .narita-route-research [class*="pageHeroCopy"],
        [data-ln-visual-root] .narita-route-research [class*="pageHeroCopy"] *,
        [data-ln-visual-root] .narita-route-research [class*="researchList"],
        [data-ln-visual-root] .narita-route-research [class*="researchList"] *,
        [data-ln-visual-root] .narita-route-research [class*="researchListCopy"],
        [data-ln-visual-root] .narita-route-research [class*="researchListCopy"] *,
        [data-ln-visual-root] .narita-route-research [class*="projectQuestion"],
        [data-ln-visual-root] .narita-route-research [class*="projectQuestion"] *,
        [data-ln-visual-root] .narita-route-research [class*="projectNarrative"],
        [data-ln-visual-root] .narita-route-research [class*="projectNarrative"] *,
        [data-ln-visual-root] .narita-route-research [class*="detailList"],
        [data-ln-visual-root] .narita-route-research [class*="detailList"] *,
        [data-ln-visual-root] .narita-route-research [class*="returnLink"] {
          color: #111111 !important;
          text-shadow: none !important;
        }

        [data-ln-visual-root] .narita-route-research [class*="pageHeroCopy"] p,
        [data-ln-visual-root] .narita-route-research [class*="pageHeroCopy"] > div,
        [data-ln-visual-root] .narita-route-research [class*="researchListCopy"] p,
        [data-ln-visual-root] .narita-route-research [class*="projectNarrative"] p,
        [data-ln-visual-root] .narita-route-research figcaption {
          color: #4f5b58 !important;
        }

        /* The editor chrome must never inherit the active website renderer's
           palette. Keep settings/history/add/manage dialogs readable even
           when the site design defines global button or heading colors. */
        [class*="modalBackdrop"] > section[class*="modal"] {
          background: #f7f8f5 !important;
          color: #173129 !important;
        }

        [class*="modalBackdrop"] > section[class*="modal"] > header {
          background: #ffffff !important;
          color: #173129 !important;
        }

        [class*="modalBackdrop"] > section[class*="modal"] h2,
        [class*="modalBackdrop"] > section[class*="modal"] h3,
        [class*="modalBackdrop"] > section[class*="modal"] strong {
          color: #173129 !important;
        }

        [class*="modalBackdrop"] > section[class*="modal"] header p,
        [class*="modalBackdrop"] > section[class*="modal"] [class*="helperText"],
        [class*="modalBackdrop"] > section[class*="modal"] [class*="emptyText"],
        [class*="modalBackdrop"] > section[class*="modal"] [class*="addGrid"] button span {
          color: #5f7069 !important;
        }

        [class*="modalBackdrop"] > section[class*="modal"] [class*="addGrid"] button {
          background: #ffffff !important;
          color: #173129 !important;
          border-color: #cbd5cf !important;
        }

        [class*="modalBackdrop"] > section[class*="modal"] [class*="addGrid"] button:hover {
          background: #f0f6f3 !important;
          border-color: #6f9f91 !important;
        }

        [class*="modalBackdrop"] > section[class*="modal"] [class*="addGrid"] button[class*="editOn"] {
          background: #173f3c !important;
          border-color: #2fb6ad !important;
          color: #ffffff !important;
        }

        [class*="modalBackdrop"] > section[class*="modal"] [class*="addGrid"] button[class*="editOn"] strong,
        [class*="modalBackdrop"] > section[class*="modal"] [class*="addGrid"] button[class*="editOn"] span {
          color: #ffffff !important;
        }

        [class*="modalBackdrop"] > section[class*="modal"] input,
        [class*="modalBackdrop"] > section[class*="modal"] textarea {
          background: #ffffff !important;
          color: #173129 !important;
        }
      `}</style>
    </>
  );
}
