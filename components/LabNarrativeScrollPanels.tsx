"use client";

import { useEffect } from "react";

type PanelMeasurement = {
  element: HTMLElement;
  start: number;
  end?: number;
  speed: number;
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

export default function LabNarrativeScrollPanels() {
  useEffect(() => {
    const hero = document.querySelector("main > section#top");
    const main = hero?.parentElement;
    if (!(main instanceof HTMLElement)) return;

    const sections = Array.from(main.children).filter(
      (element): element is HTMLElement =>
        element instanceof HTMLElement && element.tagName === "SECTION",
    );

    if (sections.length === 0) return;

    const movingPanels = sections;

    main.classList.add("ln-overlap-ready");

    sections.forEach((section, index) => {
      section.style.setProperty("--ln-panel-layer", String(index));
      section.classList.add("ln-narita-panel");
    });

    let frame = 0;
    let measurements: PanelMeasurement[] = [];

    const measure = () => {
      const pricingPanel = sections.find((section) => section.id === "pricing");
      const pricingStart = pricingPanel ? documentTop(pricingPanel) : undefined;

      measurements = movingPanels.map((panel) => ({
        element: panel,
        start: documentTop(panel),
        end: panel.id === "process" ? pricingStart : undefined,
        speed: panel.id === "pricing" ? 0.4 : 0.36,
      }));
    };

    const update = () => {
      frame = 0;

      measurements.forEach(({ element, start, end, speed }) => {
        const travelled = Math.max(0, window.scrollY - start);
        const distance =
          typeof end === "number"
            ? Math.min(travelled, Math.max(0, end - start))
            : travelled;
        const offset = -(distance * speed);
        element.style.setProperty("--ln-panel-offset", `${offset.toFixed(2)}px`);
      });
    };

    const requestUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    const remeasure = () => {
      measure();
      requestUpdate();
    };

    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(remeasure)
        : undefined;
    resizeObserver?.observe(main);
    sections.forEach((section) => resizeObserver?.observe(section));

    measure();
    update();
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", remeasure);
    window.addEventListener("load", remeasure);

    return () => {
      window.removeEventListener("scroll", requestUpdate);
      window.removeEventListener("resize", remeasure);
      window.removeEventListener("load", remeasure);
      resizeObserver?.disconnect();
      if (frame) window.cancelAnimationFrame(frame);

      sections.forEach((section) => {
        section.classList.remove("ln-narita-panel", "ln-narita-static");
        section.style.removeProperty("--ln-panel-layer");
        section.style.removeProperty("--ln-panel-offset");
      });
      main.classList.remove("ln-overlap-ready");
    };
  }, []);

  return (
    <style jsx global>{`
      body main:has(> section#top) > header {
        position: relative !important;
        top: auto !important;
        z-index: 100 !important;
        background: var(--ln-paper) !important;
        background-image: none !important;
        box-shadow: none !important;
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
        filter: none !important;
        transform: none !important;
      }

      main:has(> section#top)
        > section[data-ln-overlap-panel="approach"]
        article
        > span:first-child {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 48px;
        min-width: 48px;
        height: 48px;
        min-height: 48px;
        padding: 0;
        border-radius: 50%;
      }

      @media (min-width: 901px) {
        main.ln-overlap-ready {
          position: relative;
          overflow: visible !important;
          isolation: isolate;
        }

        main.ln-overlap-ready > .ln-narita-panel {
          position: sticky !important;
          top: 0 !important;
          z-index: calc(10 + var(--ln-panel-layer, 0)) !important;
          transform: translate3d(0, var(--ln-panel-offset, 0px), 0);
          transform-origin: center top;
          will-change: transform;
          backface-visibility: hidden;
          box-shadow: 0 -16px 38px rgba(8, 13, 11, 0.1);
        }

        main.ln-overlap-ready > section#top.ln-narita-panel {
          box-shadow: none !important;
        }

        main.ln-overlap-ready > footer {
          position: relative;
          z-index: 100;
          transform: none !important;
        }
      }

      @media (max-width: 900px), (prefers-reduced-motion: reduce) {
        main.ln-overlap-ready > .ln-narita-panel,
        main.ln-overlap-ready > .ln-narita-static {
          position: relative !important;
          top: auto !important;
          transform: none !important;
          will-change: auto;
          box-shadow: none;
        }
      }
    `}</style>
  );
}
