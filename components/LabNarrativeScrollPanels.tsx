"use client";

import { useEffect } from "react";

type PanelMeasurement = {
  element: HTMLElement;
  start: number;
  maxOffset: number;
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

    if (sections.length < 2) return;

    const movingPanels = sections.slice(0, -1);
    const terminalPanel = sections[sections.length - 1];

    main.classList.add("ln-overlap-ready");

    sections.forEach((section, index) => {
      section.classList.add("ln-narita-panel");
      section.style.setProperty("--ln-panel-layer", String(index));
    });
    terminalPanel.classList.add("ln-narita-terminal");

    let frame = 0;
    let measurements: PanelMeasurement[] = [];

    const measure = () => {
      measurements = movingPanels.map((panel) => ({
        element: panel,
        start: documentTop(panel),
        maxOffset: Math.min(190, Math.max(110, panel.offsetHeight * 0.15)),
      }));
    };

    const update = () => {
      frame = 0;

      measurements.forEach(({ element, start, maxOffset }) => {
        const distance = Math.max(0, window.scrollY - start);
        const offset = -Math.min(maxOffset, distance * 0.2);
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

    const resizeObserver = typeof ResizeObserver !== "undefined"
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
        section.classList.remove("ln-narita-panel", "ln-narita-terminal");
        section.style.removeProperty("--ln-panel-layer");
        section.style.removeProperty("--ln-panel-offset");
      });
      main.classList.remove("ln-overlap-ready");
    };
  }, []);

  return (
    <style jsx global>{`
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

        main.ln-overlap-ready > .ln-narita-terminal {
          position: relative !important;
          top: auto !important;
          z-index: calc(10 + var(--ln-panel-layer, 0)) !important;
          transform: none !important;
          will-change: auto;
        }

        main.ln-overlap-ready > footer {
          position: relative;
          z-index: 40;
        }
      }

      @media (max-width: 900px), (prefers-reduced-motion: reduce) {
        main.ln-overlap-ready > .ln-narita-panel {
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
