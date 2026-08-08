"use client";

import { useEffect, useRef } from "react";
import NaritaOverlapDesign from "@/components/designs/NaritaOverlapDesign";
import { withNaritaHero } from "@/components/designs/naritaShared";
import type { LabSite, SiteRoute } from "@/lib/sites";

type CiribilliNaritaDesignProps = {
  site: LabSite;
  route: SiteRoute;
  basePath: string;
  previewMode?: boolean;
};

export default function CiribilliNaritaDesign(props: CiribilliNaritaDesignProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const naritaSite = withNaritaHero(props.site);

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
      <NaritaOverlapDesign {...props} site={naritaSite} />
      <style jsx global>{`
        .ciribilli-narita-shell {
          --ciribilli-gutter: clamp(24px, 5vw, 76px);
        }

        .ciribilli-narita-shell .narita-overlap-design {
          --narita-header-height: 132px;
        }

        .ciribilli-narita-shell .narita-overlap-design main > header {
          box-sizing: border-box !important;
          width: 100% !important;
          height: 132px !important;
          min-height: 132px !important;
          padding: 17px var(--ciribilli-gutter) 15px !important;
          gap: 10px !important;
        }

        .ciribilli-narita-shell .narita-overlap-design main > header > a {
          font-size: clamp(24px, 2vw, 32px) !important;
          line-height: 1 !important;
        }

        .ciribilli-narita-shell .narita-overlap-design main > header > nav {
          width: 100% !important;
          gap: clamp(17px, 1.75vw, 27px) !important;
        }

        .ciribilli-narita-shell .narita-overlap-design main > header > nav a {
          padding: 6px 0 8px !important;
          font-size: 10px !important;
          line-height: 1.2 !important;
        }

        .ciribilli-narita-shell .narita-route-home main > section:first-of-type {
          width: 100% !important;
          height: calc(100svh - var(--narita-header-height)) !important;
          min-height: calc(100svh - var(--narita-header-height)) !important;
          max-height: none !important;
          margin: 0 !important;
          transform: translate3d(
            0,
            var(--ciribilli-home-panel-offset, 0px),
            0
          ) !important;
          transition: none !important;
          will-change: transform;
        }

        .ciribilli-narita-shell .narita-route-home main > section:first-of-type > img {
          object-position: center center !important;
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
          left: var(--ciribilli-gutter) !important;
          right: var(--ciribilli-gutter) !important;
          bottom: clamp(28px, 5svh, 52px) !important;
          transform: translate3d(
            0,
            var(--ciribilli-home-copy-offset, 0px),
            0
          ) !important;
          transition: none !important;
          will-change: transform;
        }

        .ciribilli-narita-shell .narita-route-home main > section:first-of-type > div:nth-of-type(2) h1 {
          max-width: min(820px, 78vw) !important;
          font-size: clamp(46px, min(7vw, 10svh), 96px) !important;
          line-height: 0.94 !important;
        }

        .ciribilli-narita-shell .narita-route-home main > section:first-of-type > div:nth-of-type(2) p {
          margin-bottom: 12px !important;
        }

        .ciribilli-narita-shell .narita-route-home main > section:first-of-type > div:nth-of-type(2) span {
          margin-top: 14px !important;
        }

        @media (max-width: 980px) {
          .ciribilli-narita-shell .narita-overlap-design {
            --narita-header-height: 122px;
          }

          .ciribilli-narita-shell .narita-overlap-design main > header {
            height: 122px !important;
            min-height: 122px !important;
            padding-top: 15px !important;
            padding-bottom: 13px !important;
            gap: 9px !important;
          }

          .ciribilli-narita-shell .narita-overlap-design main > header > a {
            font-size: clamp(21px, 2.8vw, 28px) !important;
          }
        }

        @media (max-width: 700px) {
          .ciribilli-narita-shell .narita-overlap-design {
            --narita-header-height: 108px;
          }

          .ciribilli-narita-shell .narita-overlap-design main > header {
            height: 108px !important;
            min-height: 108px !important;
            padding: 13px 20px 11px !important;
            gap: 8px !important;
          }

          .ciribilli-narita-shell .narita-route-home main > section:first-of-type {
            height: calc(100svh - var(--narita-header-height)) !important;
            min-height: calc(100svh - var(--narita-header-height)) !important;
          }

          .ciribilli-narita-shell .narita-route-home main > section:first-of-type > div:nth-of-type(2) {
            left: 20px !important;
            right: 20px !important;
            bottom: 24px !important;
          }

          .ciribilli-narita-shell .narita-route-home main > section:first-of-type > div:nth-of-type(2) h1 {
            max-width: 92vw !important;
            font-size: clamp(42px, 13vw, 68px) !important;
          }
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
