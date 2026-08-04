"use client";

import { useEffect } from "react";

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

    main.classList.add("ln-overlap-ready");

    sections.forEach((section, index) => {
      section.classList.add("ln-narita-panel");
      section.style.setProperty("--ln-panel-layer", String(index));

      if (index === sections.length - 1) {
        section.classList.add("ln-narita-terminal");
      }
    });

    return () => {
      sections.forEach((section) => {
        section.classList.remove("ln-narita-panel", "ln-narita-terminal");
        section.style.removeProperty("--ln-panel-layer");
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
          transform: translateZ(0);
          transform-origin: center top;
          backface-visibility: hidden;
          box-shadow: 0 -16px 38px rgba(8, 13, 11, 0.1);
        }

        main.ln-overlap-ready > .ln-narita-terminal {
          position: relative !important;
          top: auto !important;
          z-index: calc(10 + var(--ln-panel-layer, 0)) !important;
          transform: none !important;
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
          box-shadow: none;
        }
      }
    `}</style>
  );
}
