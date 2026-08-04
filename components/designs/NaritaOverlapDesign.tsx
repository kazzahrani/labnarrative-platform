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

type PanelMeasurement = {
  element: HTMLElement;
  start: number;
  range: number;
};

function documentTop(element: HTMLElement) {
  let top = 0;
  let current: HTMLElement | null = element;

  while (current) {
    top += current.offsetTop;
    current = current.offsetParent as HTMLElement | null;
  }

  return top;
}

function clamp(value: number) {
  return Math.min(1, Math.max(0, value));
}

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

    // The homepage now ends after the principal-investigator story.
    const hiddenHomeSections = props.route.section === "home"
      ? directSections.slice(3)
      : [];

    hiddenHomeSections.forEach((section) => {
      section.hidden = true;
    });

    const panels = Array.from(
      main.querySelectorAll(
        ":scope > section, :scope > aside, :scope > article > header, :scope > article > section",
      ),
    ).filter(
      (element): element is HTMLElement =>
        element instanceof HTMLElement &&
        !element.hidden &&
        !hiddenHomeSections.includes(element),
    );

    if (!panels.length) {
      hiddenHomeSections.forEach((section) => {
        section.hidden = false;
      });
      return;
    }

    const hero = panels[0];
    hero.classList.add("narita-overlap-hero");

    panels.forEach((panel, index) => {
      panel.classList.add("narita-overlap-panel");
      panel.style.setProperty("--narita-panel-layer", String(index));

      const backgroundColor = window.getComputedStyle(panel).backgroundColor;
      const isTransparent =
        backgroundColor === "transparent" ||
        backgroundColor === "rgba(0, 0, 0, 0)";

      panel.style.setProperty(
        "--narita-panel-background",
        isTransparent ? "#ffffff" : backgroundColor,
      );
    });

    let frame = 0;
    let measurements: PanelMeasurement[] = [];

    const measure = () => {
      const header = main.querySelector(":scope > header");
      const headerHeight = header instanceof HTMLElement ? header.offsetHeight : 112;

      root.style.setProperty("--narita-header-height", `${headerHeight}px`);
      measurements = panels.map((panel) => ({
        element: panel,
        start: documentTop(panel) - headerHeight,
        range: Math.max(panel.offsetHeight * 0.78, window.innerHeight * 0.48, 1),
      }));
    };

    const update = () => {
      frame = 0;

      measurements.forEach(({ element, start, range }) => {
        const progress = clamp((window.scrollY - start) / range);
        element.style.setProperty("--narita-panel-progress", String(progress));
      });
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

      panels.forEach((panel) => {
        panel.classList.remove("narita-overlap-panel", "narita-overlap-hero");
        panel.style.removeProperty("--narita-panel-layer");
        panel.style.removeProperty("--narita-panel-progress");
        panel.style.removeProperty("--narita-panel-background");
      });

      root.style.removeProperty("--narita-header-height");
    };
  }, [props.route.projectSlug, props.route.section]);

  return (
    <div
      className={`narita-overlap-design narita-route-${props.route.section}`}
      ref={rootRef}
    >
      <KineticPhotoLabDesign {...props} />
      <style jsx global>{`
        .narita-overlap-design {
          --narita-header-height: 112px;
          min-height: 100vh;
          background: #ffffff;
        }

        .narita-overlap-design main,
        .narita-overlap-design main > article {
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

        .narita-route-home main > section:nth-of-type(4),
        .narita-route-home main > section:nth-of-type(5),
        .narita-route-home main > section:nth-of-type(6) {
          display: none !important;
        }

        .narita-overlap-design .narita-overlap-panel {
          position: sticky !important;
          top: var(--narita-header-height) !important;
          z-index: calc(10 + var(--narita-panel-layer, 0)) !important;
          isolation: isolate;
          transform: translate3d(
            0,
            calc(var(--narita-panel-progress, 0) * -52px),
            0
          );
          transform-origin: center top;
          will-change: transform;
          scroll-margin-top: var(--narita-header-height);
        }

        .narita-overlap-design .narita-overlap-panel::before {
          content: "";
          position: absolute;
          z-index: -1;
          inset: 0 50% 0 auto;
          width: 100vw;
          transform: translateX(50%);
          background: var(--narita-panel-background, #ffffff);
          box-shadow: 0 -20px 46px rgba(0, 0, 0, 0.09);
          pointer-events: none;
        }

        .narita-overlap-design .narita-overlap-panel > img {
          transform: translate3d(
              0,
              calc(var(--narita-panel-progress, 0) * -28px),
              0
            )
            scale(1.055) !important;
          transform-origin: center center;
          will-change: transform;
        }

        .narita-overlap-design .narita-overlap-hero {
          margin-bottom: 0 !important;
          transform: translate3d(
            0,
            calc(var(--narita-panel-progress, 0) * -138px),
            0
          );
          z-index: 10 !important;
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
              calc(var(--narita-panel-progress, 0) * -38px),
              0
            )
            scale(1.1) !important;
        }

        .narita-overlap-design .narita-overlap-hero:not(.kinetic-photo-hero) > div:nth-of-type(2) {
          transform: translate3d(
            0,
            calc(var(--narita-panel-progress, 0) * -66px),
            0
          );
          will-change: transform;
        }

        .narita-overlap-design .kinetic-reveal {
          opacity: 1 !important;
          transform: none !important;
          transition: none !important;
        }

        .narita-overlap-design main > footer {
          position: relative;
          z-index: 90;
          background: #080808;
          box-shadow: 0 -24px 58px rgba(0, 0, 0, 0.14);
        }

        @media (max-width: 980px) {
          .narita-overlap-design .narita-overlap-panel {
            transform: translate3d(
              0,
              calc(var(--narita-panel-progress, 0) * -36px),
              0
            );
          }

          .narita-overlap-design .narita-overlap-hero {
            transform: translate3d(
              0,
              calc(var(--narita-panel-progress, 0) * -96px),
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
          .narita-overlap-design .narita-overlap-panel,
          .narita-overlap-design .narita-overlap-hero {
            position: relative !important;
            top: auto !important;
            transform: none !important;
          }

          .narita-overlap-design .narita-overlap-panel::before {
            box-shadow: none;
          }

          .narita-overlap-design .narita-overlap-hero.kinetic-inner-hero,
          .narita-overlap-design main > article > .narita-overlap-hero {
            width: 100% !important;
            height: 390px !important;
            min-height: 390px !important;
            margin-left: 0 !important;
          }

          .narita-overlap-design .narita-overlap-panel > img,
          .narita-overlap-design .narita-overlap-hero:not(.kinetic-photo-hero) > img,
          .narita-overlap-design .narita-overlap-hero:not(.kinetic-photo-hero) > div:nth-of-type(2) {
            transform: none !important;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .narita-overlap-design .narita-overlap-panel,
          .narita-overlap-design .narita-overlap-hero,
          .narita-overlap-design .narita-overlap-panel > img,
          .narita-overlap-design .narita-overlap-hero:not(.kinetic-photo-hero) > img,
          .narita-overlap-design .narita-overlap-hero:not(.kinetic-photo-hero) > div:nth-of-type(2) {
            position: relative !important;
            top: auto !important;
            transform: none !important;
          }
        }
      `}</style>
    </div>
  );
}
