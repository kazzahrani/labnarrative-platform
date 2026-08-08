"use client";

import { useEffect, useRef } from "react";
import NaritaOverlapDesign from "@/components/designs/NaritaOverlapDesign";
import type { LabSite, SiteRoute } from "@/lib/sites";

type CiribilliNaritaDesignProps = {
  site: LabSite;
  route: SiteRoute;
  basePath: string;
  previewMode?: boolean;
};

export default function CiribilliNaritaDesign(props: CiribilliNaritaDesignProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (props.route.section !== "home") return;

    const root = rootRef.current;
    if (!root) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;

    const update = () => {
      frame = 0;
      const distance = reducedMotion ? 0 : window.scrollY;
      root.style.setProperty("--ciribilli-home-panel-offset", `${-(distance * 0.28).toFixed(2)}px`);
      root.style.setProperty("--ciribilli-home-image-offset", `${-(distance * 0.07).toFixed(2)}px`);
      root.style.setProperty("--ciribilli-home-copy-offset", `${-(distance * 0.11).toFixed(2)}px`);
    };

    const requestUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate);

    return () => {
      window.removeEventListener("scroll", requestUpdate);
      window.removeEventListener("resize", requestUpdate);
      if (frame) window.cancelAnimationFrame(frame);
      root.style.removeProperty("--ciribilli-home-panel-offset");
      root.style.removeProperty("--ciribilli-home-image-offset");
      root.style.removeProperty("--ciribilli-home-copy-offset");
    };
  }, [props.route.section]);

  return (
    <div className="ciribilli-narita-shell" ref={rootRef}>
      <NaritaOverlapDesign {...props} />
      <style jsx global>{`
        .ciribilli-narita-shell .narita-route-home main > section:first-of-type {
          transform: translate3d(
            0,
            var(--ciribilli-home-panel-offset, 0px),
            0
          ) !important;
          transition: none !important;
          will-change: transform;
        }

        .ciribilli-narita-shell .narita-route-home main > section:first-of-type > img {
          transform: translate3d(
              0,
              var(--ciribilli-home-image-offset, 0px),
              0
            )
            scale(1.1) !important;
          transition: none !important;
          will-change: transform;
        }

        .ciribilli-narita-shell .narita-route-home main > section:first-of-type > div:nth-of-type(2) {
          transform: translate3d(
            0,
            var(--ciribilli-home-copy-offset, 0px),
            0
          ) !important;
          transition: none !important;
          will-change: transform;
        }

        @media (max-width: 700px), (prefers-reduced-motion: reduce) {
          .ciribilli-narita-shell .narita-route-home main > section:first-of-type,
          .ciribilli-narita-shell .narita-route-home main > section:first-of-type > img,
          .ciribilli-narita-shell .narita-route-home main > section:first-of-type > div:nth-of-type(2) {
            transform: none !important;
            will-change: auto;
          }
        }
      `}</style>
    </div>
  );
}
