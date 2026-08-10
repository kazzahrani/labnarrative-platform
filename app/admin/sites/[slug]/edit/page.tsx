"use client";

import { useParams } from "next/navigation";
import VisualSiteEditor from "@/components/admin/VisualSiteEditor";

export default function SiteEditorPage() {
  const params = useParams<{ slug: string }>();
  const slug = decodeURIComponent(String(params?.slug || ""));

  return (
    <>
      <VisualSiteEditor slug={slug} />
      <style jsx global>{`
        /* Research has a dark introductory hero followed by light programme
           rows. Keep the editor faithful to the renderer on both surfaces. */
        [data-ln-visual-root] .narita-route-research main > section:first-of-type > div:last-of-type,
        [data-ln-visual-root] .narita-route-research main > section:first-of-type > div:last-of-type * {
          color: #ffffff !important;
        }

        [data-ln-visual-root] .narita-route-research main > section:nth-of-type(2) > a,
        [data-ln-visual-root] .narita-route-research main > section:nth-of-type(2) > a h1,
        [data-ln-visual-root] .narita-route-research main > section:nth-of-type(2) > a h2,
        [data-ln-visual-root] .narita-route-research main > section:nth-of-type(2) > a h3,
        [data-ln-visual-root] .narita-route-research main > section:nth-of-type(2) > a p,
        [data-ln-visual-root] .narita-route-research main > section:nth-of-type(2) > a b,
        [data-ln-visual-root] .narita-route-research main > section:nth-of-type(2) > a span {
          color: #111111 !important;
        }

        [data-ln-visual-root] .narita-route-research main > article > section:not(:first-of-type),
        [data-ln-visual-root] .narita-route-research main > article > section:not(:first-of-type) h1,
        [data-ln-visual-root] .narita-route-research main > article > section:not(:first-of-type) h2,
        [data-ln-visual-root] .narita-route-research main > article > section:not(:first-of-type) h3,
        [data-ln-visual-root] .narita-route-research main > article > section:not(:first-of-type) p,
        [data-ln-visual-root] .narita-route-research main > article > section:not(:first-of-type) span {
          color: #111111 !important;
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
