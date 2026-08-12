"use client";

import { useEffect, useState } from "react";
import { browserSupabase as supabase } from "@/lib/supabase-browser";

type Props = { slug: string };

type OpenResult = {
  revision?: { content?: Record<string, any> | null } | null;
};

export default function ManualPortraitUrlAction({ slug }: Props) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !slug) return;
    let mounted = true;
    setLoading(true);
    setError("");
    void supabase.rpc("site_editor_open", { p_slug: slug }).then(({ data, error: rpcError }) => {
      if (!mounted) return;
      if (rpcError) {
        setError(rpcError.message);
      } else {
        const result = (data || {}) as OpenResult;
        setUrl(String(result.revision?.content?.pages?.home?.piImage || ""));
      }
      setLoading(false);
    });
    return () => { mounted = false; };
  }, [open, slug]);

  function hasUnsavedEditorChanges() {
    return Array.from(document.querySelectorAll("span")).some((node) => node.textContent?.trim() === "Unsaved");
  }

  async function savePortrait() {
    if (saving) return;
    if (hasUnsavedEditorChanges()) {
      setError("Save your other editor changes first, then add the portrait URL.");
      return;
    }
    const value = url.trim();
    if (value && !/^https?:\/\//i.test(value)) {
      setError("Paste a full http:// or https:// image URL.");
      return;
    }
    setSaving(true);
    setError("");
    const { data, error: rpcError } = await supabase.rpc("site_editor_set_portrait_url", {
      p_slug: slug,
      p_url: value,
    });
    if (rpcError || !data?.ok) {
      setError(rpcError?.message || "The portrait URL could not be saved.");
      setSaving(false);
      return;
    }
    window.location.reload();
  }

  return (
    <>
      <button type="button" className="ln-portrait-url-trigger" onClick={() => setOpen(true)}>
        Portrait URL
      </button>

      {open ? (
        <div className="ln-portrait-url-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setOpen(false); }}>
          <section className="ln-portrait-url-dialog" role="dialog" aria-modal="true" aria-labelledby="ln-portrait-url-title">
            <div className="ln-portrait-url-head">
              <div>
                <span>PI IMAGE</span>
                <h2 id="ln-portrait-url-title">Add portrait URL</h2>
              </div>
              <button type="button" onClick={() => setOpen(false)} disabled={saving}>×</button>
            </div>
            <p>Paste the direct URL of the principal investigator portrait. This updates the current Site Editor draft only.</p>
            <label>
              <span>Portrait image URL</span>
              <input
                autoFocus
                type="url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://institution.edu/path/portrait.jpg"
                disabled={loading || saving}
              />
            </label>
            {loading ? <p className="ln-portrait-url-note">Loading current portrait…</p> : null}
            {error ? <p className="ln-portrait-url-error">{error}</p> : null}
            <div className="ln-portrait-url-actions">
              <button type="button" onClick={() => setOpen(false)} disabled={saving}>Cancel</button>
              <button type="button" className="primary" onClick={() => void savePortrait()} disabled={loading || saving}>{saving ? "Saving…" : "Save portrait URL"}</button>
            </div>
          </section>
        </div>
      ) : null}

      <style jsx global>{`
        .ln-portrait-url-trigger {
          position: fixed;
          right: 18px;
          bottom: 122px;
          z-index: 690;
          min-height: 38px;
          padding: 9px 13px;
          border: 1px solid #315968 !important;
          border-radius: 9px;
          background: #132b38 !important;
          color: #edf5f7 !important;
          font: inherit;
          font-size: 11px;
          font-weight: 800;
          cursor: pointer;
          box-shadow: 0 8px 24px rgba(0,0,0,.2);
        }
        .ln-portrait-url-trigger:hover { background: #183746 !important; }
        .ln-portrait-url-backdrop {
          position: fixed;
          inset: 0;
          z-index: 1100;
          display: grid;
          place-items: center;
          padding: 20px;
          background: rgba(4,11,16,.78);
          backdrop-filter: blur(8px);
        }
        .ln-portrait-url-dialog {
          width: min(600px, 100%);
          box-sizing: border-box;
          padding: 24px;
          border: 1px solid rgba(126,153,168,.25);
          border-radius: 18px;
          background: #13232f !important;
          color: #edf3f6 !important;
          box-shadow: 0 28px 90px rgba(0,0,0,.42);
        }
        .ln-portrait-url-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
        .ln-portrait-url-head span { display: block; margin-bottom: 5px; color: #7bc5b5 !important; font: 800 10px/1.2 Arial,sans-serif; letter-spacing: .11em; }
        .ln-portrait-url-dialog h2 { margin: 0; color: #f3f7f8 !important; font: 700 30px/1.05 Arial,sans-serif; letter-spacing: -.03em; }
        .ln-portrait-url-head > button { border: 0 !important; background: transparent !important; color: #c9d6dc !important; font-size: 22px; cursor: pointer; }
        .ln-portrait-url-dialog > p { margin: 14px 0 18px; color: #aabcc5 !important; font: 14px/1.55 Arial,sans-serif; }
        .ln-portrait-url-dialog label { display: grid; gap: 7px; }
        .ln-portrait-url-dialog label > span { color: #cbd8de !important; font: 800 11px/1.2 Arial,sans-serif; }
        .ln-portrait-url-dialog input {
          width: 100%;
          box-sizing: border-box;
          padding: 12px 13px;
          border: 1px solid rgba(126,153,168,.3) !important;
          border-radius: 10px;
          background: #0b1722 !important;
          color: #edf3f6 !important;
          font: 600 13px/1.3 Arial,sans-serif;
          outline: none;
        }
        .ln-portrait-url-dialog input:focus { border-color: #4d9c8a !important; box-shadow: 0 0 0 3px rgba(77,156,138,.14); }
        .ln-portrait-url-dialog .ln-portrait-url-note { margin: 10px 0 0; color: #93aab4 !important; font-size: 12px; }
        .ln-portrait-url-dialog .ln-portrait-url-error { margin: 10px 0 0; color: #ff9c9c !important; font-size: 12px; font-weight: 700; }
        .ln-portrait-url-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px; }
        .ln-portrait-url-actions button { min-height: 40px; padding: 9px 14px; border: 1px solid rgba(126,153,168,.25) !important; border-radius: 9px; background: transparent !important; color: #e7eef1 !important; font: 800 12px Arial,sans-serif; cursor: pointer; }
        .ln-portrait-url-actions button.primary { border-color: rgba(63,143,113,.55) !important; background: #2f6f5e !important; color: #f4fbf8 !important; }
        .ln-portrait-url-actions button:disabled { opacity: .5; cursor: default; }
      `}</style>
    </>
  );
}
