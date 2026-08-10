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
      `}</style>
    </>
  );
}
