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

    const hiddenHomeSections = props.route.section === "home"
      ? directSections.slice(3)
      : [];

    hiddenHomeSections.forEach((section) => {
      section.hidden = true;
    });

    const panelCandidates = Array.from(
      main.querySelectorAll(
        ":scope > section, :scope > aside, :scope > article > header, :scope > article > section",
      ),
    ).filter(
      (element): element is HTMLElement =>
        element instanceof HTMLElement &&
        !element.hidden &&
        !hiddenHomeSections.includes(element),
    );

    const finalDirectSection = directSections[directSections.length - 1];
    const homePrincipalSection = props.route.section === "home"
      ? directSections[2]
      : undefined;

    const flowTailElements = panelCandidates.filter((element) => {
      if (element === homePrincipalSection) return true;
      if (props.route.section === "members" && element.tagName === "ASIDE") {
        return true;
      }
      if (props.route.section === "join" && element === finalDirectSection) {
        return true;
      }
      return false;
    });

    const panels = panelCandidates.filter(
      (element) => !flowTailElements.includes(element),
    );

    flowTailElements.forEach((element) => {
      element.classList.add("narita-overlap-flow-tail");
    });

    if (!panels.length) {
      hiddenHomeSections.forEach((section) => {
        section.hidden = false;
      });
      flowTailElements.forEach((element) => {
        element.classList.remove("narita-overlap-flow-tail");
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
      measurements = movingPanels.map((panel) => {
        const isHero = panel === hero;
        const isHomeHero = isHero && props.route.section === "home";
        const isInnerHero = isHero && props.route.section !== "home";

        return {
          element: panel,
          start: isInnerHero ? 0 : documentTop(panel) - headerHeight,
          panelSpeed: isHomeHero ? 0.28 : isInnerHero ? 0.3 : 0.22,
          imageSpeed: isHomeHero ? 0.07 : isInnerHero ? 0.09 : 0.055,
          copySpeed: isHomeHero ? 0.11 : isInnerHero ? 0.13 : 0.085,
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
    flowTailElements.forEach((element) => resizeObserver?.observe(element));

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
      flowTailElements.forEach((element) => {
        element.classList.remove("narita-overlap-flow-tail");
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

  useEffect(() => {
    if (props.route.section !== "home") return;

    const root = rootRef.current;
    if (!root) return;

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    let timer = 0;

    const stopTimer = () => {
      if (timer) window.clearInterval(timer);
      timer = 0;
    };

    const advanceSlide = () => {
      const dots = Array.from(
        root.querySelectorAll<HTMLButtonElement>(".kinetic-gallery-dot"),
      );
      if (dots.length < 2) return;

      const currentIndex = dots.findIndex((dot) =>
        dot.classList.contains("is-active"),
      );
      const nextIndex = currentIndex >= 0
        ? (currentIndex + 1) % dots.length
        : 0;
      dots[nextIndex]?.click();
    };

    const startTimer = () => {
      stopTimer();
      if (!reducedMotion && !document.hidden) {
        timer = window.setInterval(advanceSlide, 5000);
      }
    };

    const observeGallery = new MutationObserver(() => {
      if (root.querySelectorAll(".kinetic-gallery-dot").length > 1) {
        startTimer();
      }
    });

    const onVisibilityChange = () => {
      if (document.hidden) stopTimer();
      else startTimer();
    };

    observeGallery.observe(root, { childList: true, subtree: true });
    document.addEventListener("visibilitychange", onVisibilityChange);
    startTimer();

    return () => {
      stopTimer();
      observeGallery.disconnect();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [props.route.section]);

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
          min-height: 136px !important;
          padding: 22px clamp(24px, 5vw, 76px) 19px !important;
          display: flex !important;
          flex-direction: column !important;
          align-items: flex-start !important;
          justify-content: center !important;
          gap: 13px !important;
        }

        .narita-overlap-design main > header > a {
          max-width: 100%;
          font-size: clamp(22px, 2.15vw, 34px) !important;
          line-height: 1.08 !important;
          white-space: nowrap !important;
        }

        .narita-overlap-design main > header > nav {
          width: 100%;
          display: flex !important;
          align-items: center !important;
          justify-content: flex-start !important;
          gap: clamp(15px, 1.8vw, 28px) !important;
          flex-wrap: nowrap !important;
          white-space: nowrap;
          overflow-x: auto;
          overflow-y: hidden;
          scrollbar-width: none;
        }

        .narita-overlap-design main > header > nav::-webkit-scrollbar {
          display: none;
        }

        .narita-overlap-design main > header > nav a {
          flex: 0 0 auto;
          padding: 7px 0 9px !important;
          font-size: 10px !important;
          letter-spacing: 0.145em !important;
        }

        .narita-route-home .kinetic-scroll-cue,
        .narita-route-home .kinetic-gallery-arrow {
          display: none !important;
        }

        .narita-route-home .kinetic-gallery-controls {
          bottom: 18px !important;
          left: auto !important;
          right: 22px !important;
          gap: 0 !important;
          opacity: 0.46;
          transform: none !important;
        }

        .narita-route-home .kinetic-gallery-dots {
          background: rgba(5, 5, 5, 0.2) !important;
          border-color: rgba(255, 255, 255, 0.16) !important;
          gap: 6px !important;
          padding: 6px 8px !important;
        }

        .narita-route-home .kinetic-gallery-dot {
          background: rgba(255, 255, 255, 0.42) !important;
          height: 4px !important;
          width: 4px !important;
        }

        .narita-route-home .kinetic-gallery-dot.is-active {
          background: rgba(255, 255, 255, 0.82) !important;
          width: 18px !important;
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

        .narita-overlap-design .narita-overlap-terminal,
        .narita-overlap-design .narita-overlap-flow-tail {
          position: relative !important;
          top: auto !important;
          transform: none !important;
          will-change: auto;
        }

        .narita-overlap-design .narita-overlap-terminal {
          z-index: calc(10 + var(--narita-panel-layer, 0)) !important;
        }

        .narita-overlap-design .narita-overlap-flow-tail {
          z-index: var(--narita-footer-layer) !important;
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

        .narita-overlap-design .narita-overlap-panel:not(.narita-overlap-terminal) > img:not(.kinetic-gallery-slide) {
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

        .narita-route-home .kinetic-photo-hero > .kinetic-gallery-slide {
          transform: translate3d(
              0,
              calc(var(--kinetic-progress, 0) * -72px),
              0
            )
            scale(1.065) !important;
          transform-origin: center center;
          will-change: transform;
        }

        .narita-route-home .kinetic-photo-hero > .kinetic-gallery-slide.is-active {
          transform: translate3d(
              0,
              calc(var(--kinetic-progress, 0) * -72px),
              0
            )
            scale(1.025) !important;
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

        .narita-overlap-design:not(.narita-route-home) .narita-overlap-hero.kinetic-inner-hero,
        .narita-overlap-design:not(.narita-route-home) main > article > .narita-overlap-hero {
          width: 100vw !important;
          height: clamp(260px, 28vw, 360px) !important;
          min-height: 260px !important;
          max-height: 360px !important;
          margin-left: calc(50% - 50vw) !important;
        }

        .narita-overlap-design:not(.narita-route-home) main > article > .narita-overlap-hero {
          height: clamp(220px, 22vw, 300px) !important;
          min-height: 220px !important;
          max-height: 300px !important;
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
          .narita-overlap-design main > header {
            min-height: 124px !important;
            padding-top: 18px !important;
            padding-bottom: 15px !important;
            gap: 10px !important;
          }

          .narita-overlap-design main > header > a {
            font-size: clamp(19px, 3vw, 28px) !important;
          }

          .narita-overlap-design main > header > nav {
            gap: 17px !important;
          }

          .narita-overlap-design main > header > nav a {
            font-size: 9px !important;
            letter-spacing: 0.13em !important;
          }

          .narita-overlap-design:not(.narita-route-home) .narita-overlap-hero.kinetic-inner-hero,
          .narita-overlap-design:not(.narita-route-home) main > article > .narita-overlap-hero {
            height: clamp(235px, 38vw, 320px) !important;
            min-height: 235px !important;
            max-height: 320px !important;
          }

          .narita-overlap-design:not(.narita-route-home) main > article > .narita-overlap-hero {
            height: clamp(205px, 31vw, 270px) !important;
            min-height: 205px !important;
            max-height: 270px !important;
          }
        }

        @media (max-width: 700px) {
          .narita-overlap-design main > header {
            min-height: 112px !important;
            padding: 16px 20px 13px !important;
            gap: 9px !important;
          }

          .narita-overlap-design main > header > a {
            font-size: clamp(16px, 4.7vw, 22px) !important;
            white-space: normal !important;
          }

          .narita-overlap-design main > header > nav {
            gap: 15px !important;
          }

          .narita-overlap-design main > header > nav a {
            font-size: 8.5px !important;
          }

          .narita-route-home .kinetic-gallery-controls {
            bottom: 12px !important;
            right: 12px !important;
          }

          .narita-overlap-design .narita-overlap-panel,
          .narita-overlap-design .narita-overlap-hero {
            position: relative !important;
            top: auto !important;
            transform: none !important;
          }

          .narita-overlap-design .narita-overlap-panel::before {
            box-shadow: none;
          }

          .narita-overlap-design:not(.narita-route-home) .narita-overlap-hero.kinetic-inner-hero,
          .narita-overlap-design:not(.narita-route-home) main > article > .narita-overlap-hero {
            width: 100% !important;
            height: 230px !important;
            min-height: 230px !important;
            max-height: 230px !important;
            margin-left: 0 !important;
          }

          .narita-overlap-design:not(.narita-route-home) main > article > .narita-overlap-hero {
            height: 210px !important;
            min-height: 210px !important;
            max-height: 210px !important;
          }

          .narita-overlap-design .narita-overlap-panel > img:not(.kinetic-gallery-slide),
          .narita-overlap-design .narita-overlap-panel > div:nth-of-type(2),
          .narita-overlap-design .narita-overlap-hero:not(.kinetic-photo-hero) > img {
            transform: none !important;
          }

          .narita-route-home .kinetic-photo-hero > .kinetic-gallery-slide {
            transform: translate3d(
                0,
                calc(var(--kinetic-progress, 0) * -28px),
                0
              )
              scale(1.045) !important;
          }

          .narita-route-home .kinetic-photo-hero > .kinetic-gallery-slide.is-active {
            transform: translate3d(
                0,
                calc(var(--kinetic-progress, 0) * -28px),
                0
              )
              scale(1.015) !important;
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