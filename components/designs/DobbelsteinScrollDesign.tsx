"use client";

import { useEffect, useRef } from "react";
import DobbelsteinEditorialDesign, {
  DOBBELSTEIN_EDITORIAL_SETTINGS,
} from "@/components/designs/DobbelsteinEditorialDesign";
import type { LabSite, SiteRoute } from "@/lib/sites";

export const DOBBELSTEIN_SCROLL_VARIANT = "dobbelstein-scroll-v1";

const SECTION_COLORS = [
  "#f4f3ef",
  "#dce8f2",
  "#f1dfcf",
  "#dfe8dc",
] as const;

const SECTION_SCROLL_SPEED = 0.22;

type Measurement = {
  element: HTMLElement;
  start: number;
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
    const footer = main.querySelector<HTMLElement>(":scope > .bn-footer");
    const sections = Array.from(main.querySelectorAll<HTMLElement>(":scope > section"));
    if (!sections.length) return;

    const joinSection = sections.find((section) => section.classList.contains("bn-join-strip"));
    const moving = sections.filter((section) => section !== joinSection);

    header?.classList.add("dobbelstein-scroll-chrome");
    footer?.classList.add("dobbelstein-scroll-chrome");
    joinSection?.classList.add("dobbelstein-scroll-static");

    moving.forEach((section, index) => {
      section.classList.add("dobbelstein-scroll-panel");
      section.style.setProperty("--dobbelstein-panel-layer", String(index));
      section.style.setProperty("--dobbelstein-panel-background", SECTION_COLORS[index % SECTION_COLORS.length]);
    });

    let measurements: Measurement[] = [];
    let frame = 0;

    const measure = () => {
      const headerHeight = header?.offsetHeight ?? 104;
      root.style.setProperty("--dobbelstein-header-height", `${headerHeight}px`);
      measurements = moving.map((element) => ({
        element,
        start: Math.max(0, documentTop(element) - headerHeight),
      }));
    };

    const update = () => {
      frame = 0;
      measurements.forEach(({ element, start }) => {
        const distance = reducedMotion ? 0 : Math.max(0, window.scrollY - start);
        element.style.setProperty(
          "--dobbelstein-panel-offset",
          `${-(distance * SECTION_SCROLL_SPEED).toFixed(2)}px`,
        );
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
    moving.forEach((section) => resizeObserver?.observe(section));
    if (joinSection) resizeObserver?.observe(joinSection);

    measure();
    update();
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", remeasure);

    return () => {
      window.removeEventListener("scroll", requestUpdate);
      window.removeEventListener("resize", remeasure);
      resizeObserver?.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
      header?.classList.remove("dobbelstein-scroll-chrome");
      footer?.classList.remove("dobbelstein-scroll-chrome");
      joinSection?.classList.remove("dobbelstein-scroll-static");
      moving.forEach((section) => {
        section.classList.remove("dobbelstein-scroll-panel");
        section.style.removeProperty("--dobbelstein-panel-layer");
        section.style.removeProperty("--dobbelstein-panel-background");
        section.style.removeProperty("--dobbelstein-panel-offset");
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
          background: #f4f3ef;
        }

        .dobbelstein-scroll-route-home .bourdon-site {
          position: relative;
          isolation: isolate;
          overflow: visible !important;
        }

        .dobbelstein-scroll-route-home .dobbelstein-scroll-chrome,
        .dobbelstein-scroll-route-home .dobbelstein-scroll-static {
          position: relative !important;
          top: auto !important;
          transform: none !important;
          will-change: auto !important;
        }

        .dobbelstein-scroll-route-home .bourdon-site > .bn-site-header {
          z-index: 100 !important;
        }

        .dobbelstein-scroll-route-home .bourdon-site > .bn-footer,
        .dobbelstein-scroll-route-home .bn-join-strip {
          z-index: 100 !important;
        }

        .dobbelstein-scroll-route-home .dobbelstein-scroll-panel {
          position: sticky !important;
          top: 0 !important;
          isolation: isolate;
          min-height: clamp(560px, 78svh, 820px);
          background: var(--dobbelstein-panel-background) !important;
          transform-origin: center top;
          transition: none !important;
          z-index: calc(10 + var(--dobbelstein-panel-layer, 0)) !important;
          transform: translate3d(0, var(--dobbelstein-panel-offset, 0px), 0) !important;
          will-change: transform;
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
          box-shadow: none !important;
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

        .dobbelstein-scroll-route-home .bn-home-hero,
        .dobbelstein-scroll-route-home .bn-home-hero .bn-hero-grid {
          min-height: 100svh !important;
        }

        .dobbelstein-scroll-route-home .bn-join-strip {
          background: #117b79 !important;
        }

        @media (max-width: 760px), (prefers-reduced-motion: reduce) {
          .dobbelstein-scroll-route-home .dobbelstein-scroll-panel {
            position: relative !important;
            top: auto !important;
            transform: none !important;
            will-change: auto;
            min-height: auto;
          }
        }
      `}</style>
    </div>
  );
}
