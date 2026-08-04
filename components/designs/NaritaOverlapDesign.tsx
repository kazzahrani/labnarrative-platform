"use client";

import { useEffect, useRef } from "react";
import KineticPhotoLabDesign from "@/components/designs/KineticPhotoLabDesign";
import type { LabSite, SiteRoute } from "@/lib/sites";

type NaritaOverlapDesignProps = {
  site: LabSite;
  route: SiteRoute;
  basePath: string;
  previewMode?: boolean;
};

export default function NaritaOverlapDesign(props: NaritaOverlapDesignProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const main = root?.querySelector("main");
    if (!root || !main) return;

    const directSections = Array.from(main.children).filter(
      (element): element is HTMLElement =>
        element instanceof HTMLElement && element.tagName === "SECTION",
    );
    const hiddenHomeSections = props.route.section === "home"
      ? directSections.slice(3, 5)
      : [];

    hiddenHomeSections.forEach((section) => {
      section.hidden = true;
    });

    const hero = props.route.section === "home"
      ? main.querySelector(":scope > section:first-of-type")
      : main.querySelector(":scope > section:first-of-type, :scope > article > section:first-child");

    if (!(hero instanceof HTMLElement)) {
      hiddenHomeSections.forEach((section) => {
        section.hidden = false;
      });
      return;
    }

    hero.classList.add("narita-overlap-hero");
    let frame = 0;
    let start = 0;
    let range = 1;

    const measure = () => {
      const header = main.querySelector(":scope > header");
      const headerHeight = header instanceof HTMLElement ? header.offsetHeight : 112;
      const rect = hero.getBoundingClientRect();
      start = rect.top + window.scrollY - headerHeight;
      range = Math.max(1, hero.offsetHeight * 0.88);
      root.style.setProperty("--narita-header-height", `${headerHeight}px`);
    };

    const update = () => {
      frame = 0;
      const progress = Math.min(1, Math.max(0, (window.scrollY - start) / range));
      hero.style.setProperty("--narita-overlap-progress", String(progress));
    };

    const requestUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    const onResize = () => {
      measure();
      requestUpdate();
    };

    measure();
    update();
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("scroll", requestUpdate);
      window.removeEventListener("resize", onResize);
      if (frame) window.cancelAnimationFrame(frame);
      hiddenHomeSections.forEach((section) => {
        section.hidden = false;
      });
      hero.classList.remove("narita-overlap-hero");
      hero.style.removeProperty("--narita-overlap-progress");
      root.style.removeProperty("--narita-header-height");
    };
  }, [props.route.projectSlug, props.route.section]);

  return (
    <div className="narita-overlap-design" ref={rootRef}>
      <KineticPhotoLabDesign {...props} />
      <style jsx global>{`
        .narita-overlap-design {
          --narita-header-height: 112px;
          min-height: 100vh;
          background: #ffffff;
        }

        .narita-overlap-design main {
          position: relative;
          isolation: isolate;
          overflow: visible !important;
          background: #ffffff;
        }

        .narita-overlap-design main > header {
          position: sticky !important;
          top: 0;
          z-index: 100 !important;
        }

        .narita-overlap-design .narita-overlap-hero {
          position: sticky !important;
          top: var(--narita-header-height) !important;
          z-index: 1 !important;
          margin-bottom: 0 !important;
          transform: translate3d(
            0,
            calc(var(--narita-overlap-progress, 0) * -138px),
            0
          );
          transform-origin: center top;
          will-change: transform;
        }

        .narita-overlap-design .narita-overlap-hero.kinetic-inner-hero,
        .narita-overlap-design main > article > .narita-overlap-hero {
          width: 100vw !important;
          height: clamp(430px, 47vw, 560px) !important;
          min-height: 430px !important;
          max-height: 560px !important;
          margin-left: calc(50% - 50vw) !important;
        }

        .narita-overlap-design .narita-overlap-hero:not(.kinetic-photo-hero) > img {
          transform: translate3d(
              0,
              calc(var(--narita-overlap-progress, 0) * -38px),
              0
            )
            scale(1.1) !important;
          transform-origin: center center;
          will-change: transform;
        }

        .narita-overlap-design .narita-overlap-hero:not(.kinetic-photo-hero) > div:nth-of-type(2) {
          transform: translate3d(
            0,
            calc(var(--narita-overlap-progress, 0) * -66px),
            0
          );
          will-change: transform;
        }

        .narita-overlap-design .narita-overlap-hero ~ section,
        .narita-overlap-design .narita-overlap-hero ~ aside,
        .narita-overlap-design .narita-overlap-hero ~ a,
        .narita-overlap-design main > footer {
          position: relative;
          z-index: 4;
        }

        .narita-overlap-design .narita-overlap-hero ~ section {
          background: #ffffff;
          isolation: isolate;
        }

        .narita-overlap-design .narita-overlap-hero ~ section::before {
          content: "";
          position: absolute;
          z-index: -1;
          top: 0;
          bottom: 0;
          left: 50%;
          width: 100vw;
          transform: translateX(-50%);
          background: #ffffff;
          pointer-events: none;
        }

        .narita-overlap-design .narita-overlap-hero + section::before {
          box-shadow: 0 -18px 44px rgba(0, 0, 0, 0.08);
        }

        .narita-overlap-design .kinetic-reveal {
          opacity: 1 !important;
          transform: none !important;
          transition: none !important;
        }

        .narita-overlap-design main > footer {
          background: #080808;
        }

        @media (max-width: 980px) {
          .narita-overlap-design .narita-overlap-hero {
            transform: translate3d(
              0,
              calc(var(--narita-overlap-progress, 0) * -96px),
              0
            );
          }

          .narita-overlap-design .narita-overlap-hero.kinetic-inner-hero,
          .narita-overlap-design main > article > .narita-overlap-hero {
            height: clamp(390px, 58vw, 500px) !important;
            min-height: 390px !important;
          }
        }

        @media (max-width: 700px) {
          .narita-overlap-design .narita-overlap-hero {
            position: relative !important;
            top: auto !important;
            transform: none !important;
          }

          .narita-overlap-design .narita-overlap-hero.kinetic-inner-hero,
          .narita-overlap-design main > article > .narita-overlap-hero {
            width: 100% !important;
            height: 390px !important;
            min-height: 390px !important;
            margin-left: 0 !important;
          }

          .narita-overlap-design .narita-overlap-hero:not(.kinetic-photo-hero) > img,
          .narita-overlap-design .narita-overlap-hero:not(.kinetic-photo-hero) > div:nth-of-type(2) {
            transform: none !important;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .narita-overlap-design .narita-overlap-hero,
          .narita-overlap-design .narita-overlap-hero:not(.kinetic-photo-hero) > img,
          .narita-overlap-design .narita-overlap-hero:not(.kinetic-photo-hero) > div:nth-of-type(2) {
            transform: none !important;
          }
        }
      `}</style>
    </div>
  );
}
