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
  panelSpeed: number;
  imageSpeed: number;
  copySpeed: number;
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
    const terminalPanel = panels[panels.length - 1];
    const movingPanels = panels.length > 1 ? panels.slice(0, -1) : [];

    hero.classList.add("narita-overlap-hero");
    terminalPanel.classList.add("narita-overlap-terminal");
    root.style.setProperty("--narita-footer-layer", String(12 + panels.length));

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
      measurements = movingPanels.map((panel, index) => {
        const isHero = panel === hero || index === 0;

        return {
          element: panel,
          start: documentTop(panel) - headerHeight,
          panelSpeed: isHero ? 0.28 : 0.22,
          imageSpeed: isHero ? 0.07 : 0.055,
          copySpeed: isHero ? 0.11 : 0.085,
        };
      });
    };

    const update = () => {
      frame = 0;

      measurements.forEach(
        ({ element, start, panelSpeed, imageSpeed, copySpeed }) => {
          const distance = Math.max(0, window.scrollY - start);

          element.style.setProperty(
            "--narita-panel-offset",
            `${-(distance * panelSpeed).toFixed(2)}px`,
          );
          element.style.setProperty(
            "--narita-image-offset",
            `${-(distance * imageSpeed).toFixed(2)}px`,
          );
          element.style.setProperty(
            "--narita-copy-offset",
            `${-(distance * copySpeed).toFixed(2)}px`,
          );
        },
      );
    };

    const requestUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    const remeasure = () => {
      measure();
      requestUpdate();
    };

    const images = Array.from(main.querySelectorAll("img"));
    images.forEach((image) => image.addEventListener("load", remeasure));

    const resizeObserver = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(remeasure)
      : undefined;
    resizeObserver?.observe(main);
    panels.forEach((panel) => resizeObserver?.observe(panel));

    measure();
    update();
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", remeasure);
    window.addEventListener("load", remeasure);

    return () => {
      window.removeEventListener("scroll", requestUpdate);
      window.removeEventListener("resize", remeasure);
      window.removeEventListener("load", remeasure);
      images.forEach((image) => image.removeEventListener("load", remeasure));
      resizeObserver?.disconnect();
      if (frame) window.cancelAnimationFrame(frame);

      hiddenHomeSections.forEach((section) => {
        section.hidden = false;
      });

      panels.forEach((panel) => {
        panel.classList.remove(
          "narita-overlap-panel",
          "narita-overlap-hero",
          "narita-overlap-terminal",
        );
        panel.style.removeProperty("--narita-panel-layer");
        panel.style.removeProperty("--narita-panel-offset");
        panel.style.removeProperty("--narita-image-offset");
        panel.style.removeProperty("--narita-copy-offset");
        panel.style.removeProperty("--narita-panel-background");
      });

      root.style.removeProperty("--narita-header-height");
      root.style.removeProperty("--narita-footer-layer");
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
          --narita-footer-layer: 20;
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
          isolation: isolate;
          transform-origin: center top;
          transition: none !important;
          scroll-margin-top: var(--narita-header-height);
        }

        .narita-overlap-design .narita-overlap-panel:not(.narita-overlap-terminal) {
          position: sticky !important;
          top: var(--narita-header-height) !important;
          z-index: calc(10 + var(--narita-panel-layer, 0)) !important;
          transform: translate3d(
            0,
            var(--narita-panel-offset, 0px),
            0
          ) !important;
          will-change: transform;
        }

        .narita-overlap-design .narita-overlap-terminal {
          position: relative !important;
          top: auto !important;
          z-index: calc(10 + var(--narita-panel-layer, 0)) !important;
          transform: none !important;
          will-change: auto;
        }

        .narita-overlap-design .narita-overlap-panel::before {
          content: "";
          position: absolute;
          z-index: -1;
          inset: 0 50% 0 auto;
          width: 100vw;
          transform: translateX(50%);
          background: var(--narita-panel-background, #ffffff);
          pointer-events: none;
        }

        .narita-overlap-design .narita-overlap-panel:not(.narita-overlap-terminal)::before {
          box-shadow: 0 -20px 46px rgba(0, 0, 0, 0.09);
        }

        .narita-overlap-design .narita-overlap-terminal::before {
          box-shadow: 0 -16px 38px rgba(0, 0, 0, 0.07);
        }

        .narita-overlap-design .narita-overlap-panel:not(.narita-overlap-terminal) > img {
          transform: translate3d(
              0,
              var(--narita-image-offset, 0px),
              0
            )
            scale(1.055) !important;
          transform-origin: center center;
          transition: none !important;
          will-change: transform;
        }

        .narita-overlap-design .narita-overlap-panel:not(.narita-overlap-terminal) > div:nth-of-type(2) {
          transform: translate3d(
            0,
            var(--narita-copy-offset, 0px),
            0
          );
          transition: none !important;
          will-change: transform;
        }

        .narita-overlap-design .narita-overlap-hero {
          margin-bottom: 0 !important;
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

        .narita-overlap-design .narita-overlap-hero:not(.narita-overlap-terminal):not(.kinetic-photo-hero) > img {
          transform: translate3d(
              0,
              var(--narita-image-offset, 0px),
              0
            )
            scale(1.1) !important;
        }

        .narita-overlap-design .kinetic-reveal {
          opacity: 1 !important;
          transition: none !important;
        }

        .narita-overlap-design .kinetic-reveal:not(.narita-overlap-panel) {
          transform: none !important;
        }

        .narita-overlap-design main > footer {
          position: relative !important;
          top: auto !important;
          z-index: var(--narita-footer-layer) !important;
          transform: none !important;
          background: #080808;
          box-shadow: none !important;
          will-change: auto;
        }

        @media (max-width: 980px) {
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
          .narita-overlap-design .narita-overlap-panel > div:nth-of-type(2),
          .narita-overlap-design .narita-overlap-hero:not(.kinetic-photo-hero) > img {
            transform: none !important;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .narita-overlap-design .narita-overlap-panel,
          .narita-overlap-design .narita-overlap-hero,
          .narita-overlap-design .narita-overlap-panel > img,
          .narita-overlap-design .narita-overlap-panel > div:nth-of-type(2),
          .narita-overlap-design .narita-overlap-hero:not(.kinetic-photo-hero) > img {
            position: relative !important;
            top: auto !important;
            transform: none !important;
          }
        }
      `}</style>
    </div>
  );
}
