"use client";

import { useEffect, useRef } from "react";
import DobbelsteinEditorialDesign, {
  DOBBELSTEIN_EDITORIAL_SETTINGS,
} from "@/components/designs/DobbelsteinEditorialDesign";
import type { LabSite, SiteRoute } from "@/lib/sites";

export const DOBBELSTEIN_SCROLL_VARIANT = "dobbelstein-scroll-v1";

const SECTION_COLORS = [
  "#f3f6f3",
  "#e5efea",
  "#f5efe5",
  "#e9f0f3",
  "#117b79",
] as const;

type Measurement = {
  element: HTMLElement;
  start: number;
  speed: number;
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

export default function DobbelsteinScrollDesign({
  site,
  route,
  basePath,
  previewMode = false,
}: {
  site: LabSite;
  route: SiteRoute;
  basePath: string;
  previewMode?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  const scrollSite: LabSite = {
    ...site,
    design: {
      key: "bourdon-full",
      version: 3,
      settings: {
        ...(site.design?.settings ?? {}),
        ...DOBBELSTEIN_EDITORIAL_SETTINGS,
        variant: DOBBELSTEIN_SCROLL_VARIANT,
      },
    },
  };

  useEffect(() => {
    if (route.section !== "home") return;

    const root = rootRef.current;
    const main = root?.querySelector<HTMLElement>(".bourdon-site");
    if (!root || !main) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const header = main.querySelector<HTMLElement>(":scope > .bn-site-header");
    const sections = Array.from(main.querySelectorAll<HTMLElement>(":scope > section"));
    if (!sections.length) return;

    const terminal = sections[sections.length - 1];
    const moving = sections.slice(0, -1);

    sections.forEach((section, index) => {
      section.classList.add("dobbelstein-scroll-panel");
      if (section === terminal) section.classList.add("dobbelstein-scroll-terminal");
      section.style.setProperty("--dobbelstein-panel-layer", String(index));
      section.style.setProperty("--dobbelstein-panel-background", SECTION_COLORS[index % SECTION_COLORS.length]);
    });

    let measurements: Measurement[] = [];
    let frame = 0;

    const measure = () => {
      const headerHeight = header?.offsetHeight ?? 104;
      root.style.setProperty("--dobbelstein-header-height", `${headerHeight}px`);
      measurements = moving.map((element, index) => ({
        element,
        start: Math.max(0, documentTop(element) - headerHeight),
        speed: index === 0 ? 0.28 : 0.22,
        copySpeed: index === 0 ? 0.11 : 0.085,
      }));
    };

    const update = () => {
      frame = 0;
      measurements.forEach(({ element, start, speed, copySpeed }) => {
        const distance = reducedMotion ? 0 : Math.max(0, window.scrollY - start);
        element.style.setProperty("--dobbelstein-panel-offset", `${-(distance * speed).toFixed(2)}px`);
        element.style.setProperty("--dobbelstein-copy-offset", `${-(distance * copySpeed).toFixed(2)}px`);
      });
    };

    const requestUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    const remeasure = () => {
      measure();
      requestUpdate();
    };

    const resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(remeasure) : undefined;
    resizeObserver?.observe(main);
    sections.forEach((section) => resizeObserver?.observe(section));

    measure();
    update();
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", remeasure);

    return () => {
      window.removeEventListener("scroll", requestUpdate);
      window.removeEventListener("resize", remeasure);
      resizeObserver?.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
      sections.forEach((section) => {
        section.classList.remove("dobbelstein-scroll-panel", "dobbelstein-scroll-terminal");
        section.style.removeProperty("--dobbelstein-panel-layer");
        section.style.removeProperty("--dobbelstein-panel-background");
        section.style.removeProperty("--dobbelstein-panel-offset");
        section.style.removeProperty("--dobbelstein-copy-offset");
      });
      root.style.removeProperty("--dobbelstein-header-height");
    };
  }, [route.section]);

  return (
    <div className={`dobbelstein-scroll-shell dobbelstein-scroll-route-${route.section}`} ref={rootRef}>
      <DobbelsteinEditorialDesign
        site={scrollSite}
        route={route}
        basePath={basePath}
        previewMode={previewMode}
      />
      <style jsx global>{`
        .dobbelstein-scroll-shell {
          --dobbelstein-header-height: 104px;
          min-height: 100vh;
          background: #f3f6f3;
        }

        .dobbelstein-scroll-route-home .bourdon-site {
          position: relative;
          isolation: isolate;
          overflow: visible !important;
        }

        .dobbelstein-scroll-route-home .bourdon-site > .bn-site-header {
          position: sticky !important;
          top: 0;
          z-index: 100 !important;
        }

        .dobbelstein-scroll-route-home .dobbelstein-scroll-panel {
          position: relative;
          isolation: isolate;
          min-height: clamp(560px, 78svh, 820px);
          background: var(--dobbelstein-panel-background) !important;
          scroll-margin-top: var(--dobbelstein-header-height);
          transform-origin: center top;
          transition: none !important;
        }

        .dobbelstein-scroll-route-home .dobbelstein-scroll-panel::before {
          content: "";
          position: absolute;
          z-index: -1;
          inset: 0 50% 0 auto;
          width: 100vw;
          transform: translateX(50%);
          background: var(--dobbelstein-panel-background);
          pointer-events: none;
        }

        .dobbelstein-scroll-route-home .dobbelstein-scroll-panel:not(.dobbelstein-scroll-terminal) {
          position: sticky !important;
          top: var(--dobbelstein-header-height) !important;
          z-index: calc(10 + var(--dobbelstein-panel-layer, 0)) !important;
          transform: translate3d(0, var(--dobbelstein-panel-offset, 0px), 0) !important;
          will-change: transform;
        }

        .dobbelstein-scroll-route-home .dobbelstein-scroll-panel:not(.dobbelstein-scroll-terminal)::before {
          box-shadow: 0 -18px 42px rgba(14, 35, 42, 0.09);
        }

        .dobbelstein-scroll-route-home .dobbelstein-scroll-terminal {
          z-index: calc(10 + var(--dobbelstein-panel-layer, 0));
          min-height: auto;
        }

        .dobbelstein-scroll-route-home .dobbelstein-scroll-panel > .bn-page-shell,
        .dobbelstein-scroll-route-home .dobbelstein-scroll-panel.bn-page-shell > * {
          transform: translate3d(0, var(--dobbelstein-copy-offset, 0px), 0);
          transition: none !important;
          will-change: transform;
        }

        .dobbelstein-scroll-route-home .bn-home-overview,
        .dobbelstein-scroll-route-home .bn-pi-home {
          box-sizing: border-box;
          width: min(1180px, calc(100% - 48px));
          padding-top: clamp(84px, 11svh, 132px);
          padding-bottom: clamp(84px, 11svh, 132px);
          align-content: center;
        }

        .dobbelstein-scroll-route-home .bn-home-programmes > .bn-page-shell {
          padding-top: clamp(84px, 10svh, 126px);
          padding-bottom: clamp(84px, 10svh, 126px);
        }

        .dobbelstein-scroll-route-home .bn-home-hero {
          min-height: calc(100svh - var(--dobbelstein-header-height)) !important;
        }

        .dobbelstein-scroll-route-home .bn-home-hero .bn-hero-grid {
          min-height: calc(100svh - var(--dobbelstein-header-height)) !important;
        }

        .dobbelstein-scroll-route-home .bn-join-strip {
          background: #117b79 !important;
        }

        @media (max-width: 760px), (prefers-reduced-motion: reduce) {
          .dobbelstein-scroll-route-home .dobbelstein-scroll-panel,
          .dobbelstein-scroll-route-home .dobbelstein-scroll-panel:not(.dobbelstein-scroll-terminal),
          .dobbelstein-scroll-route-home .dobbelstein-scroll-panel > .bn-page-shell,
          .dobbelstein-scroll-route-home .dobbelstein-scroll-panel.bn-page-shell > * {
            position: relative !important;
            top: auto !important;
            transform: none !important;
            will-change: auto;
          }

          .dobbelstein-scroll-route-home .dobbelstein-scroll-panel {
            min-height: auto;
          }
        }
      `}</style>
    </div>
  );
}
