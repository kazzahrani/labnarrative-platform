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
