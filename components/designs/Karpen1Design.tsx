"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import Kops1Design from "@/components/designs/Kops1Design";
import type { LabSite, SiteRoute } from "@/lib/sites";

export const KARPEN_1_VARIANT = "Karpen_1";

type Props = {
  site: LabSite;
  route: SiteRoute;
  basePath: string;
  previewMode?: boolean;
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

function portraitAccent(site: LabSite) {
  const value = site.design?.settings?.portraitAccent;
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
    ? value
    : "#5d5b91";
}

function groupLabel(labName: string) {
  const base = labName.replace(/\s+(lab|laboratory|group)$/i, "").trim();
  return `The ${base || labName} Group`;
}

function innerTitleForRoute(props: Props) {
  if (props.route.projectSlug) return undefined;

  const researchIntro = (props.site.pages?.research as { introduction?: string } | undefined)?.introduction;

  switch (props.route.section) {
    case "research":
      return {
        eyebrow: "Research",
        title: "Research",
        text: researchIntro || props.site.overview || props.site.introduction,
      };
    case "members":
      return {
        eyebrow: "Group",
        title: groupLabel(props.site.labName),
        text: "The people behind the laboratory's research programme.",
      };
    case "publications":
      return {
        eyebrow: "Publications",
        title: "Selected publications",
        text: "Selected work from the laboratory and its collaborators.",
      };
    case "join":
      return {
        eyebrow: "Join",
        title: `Join ${props.site.labName}`,
        text: "Opportunities to contribute to the laboratory's research programme.",
      };
    case "contact":
      return {
        eyebrow: "Contact",
        title: `Contact ${props.site.labName}`,
        text: "Get in touch with the laboratory.",
      };
    default:
      return undefined;
  }
}

/**
 * Karpen_1
 * Kops_1-derived portrait design with a portrait-responsive group panel and
 * Narita-style homepage overlap/parallax motion.
 */
export default function Karpen1Design(props: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const accent = portraitAccent(props.site);

  useEffect(() => {
    if (props.route.section !== "home") return;

    const root = rootRef.current;
    const hero = root?.querySelector<HTMLElement>(".lens-hero");
    const group = root?.querySelector<HTMLElement>(".lens-group");
    if (!root || !hero || !group) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion || window.innerWidth <= 720) return;

    let frame = 0;
    let start = documentTop(hero);

    const measure = () => {
      start = documentTop(hero);
      requestUpdate();
    };

    const update = () => {
      frame = 0;
      const distance = Math.max(0, window.scrollY - start);

      root.style.setProperty(
        "--karpen-panel-offset",
        `${-(distance * 0.28).toFixed(2)}px`,
      );
      root.style.setProperty(
        "--karpen-image-offset",
        `${-(distance * 0.07).toFixed(2)}px`,
      );
      root.style.setProperty(
        "--karpen-copy-offset",
        `${-(distance * 0.11).toFixed(2)}px`,
      );
    };

    function requestUpdate() {
      if (!frame) frame = window.requestAnimationFrame(update);
    }

    const images = Array.from(root.querySelectorAll("img"));
    images.forEach((image) => image.addEventListener("load", measure));

    const resizeObserver = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(measure)
      : undefined;
    resizeObserver?.observe(hero);
    resizeObserver?.observe(group);

    measure();
    update();
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", measure);
    window.addEventListener("load", measure);

    return () => {
      window.removeEventListener("scroll", requestUpdate);
      window.removeEventListener("resize", measure);
      window.removeEventListener("load", measure);
      images.forEach((image) => image.removeEventListener("load", measure));
      resizeObserver?.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
      root.style.removeProperty("--karpen-panel-offset");
      root.style.removeProperty("--karpen-image-offset");
      root.style.removeProperty("--karpen-copy-offset");
    };
  }, [props.route.section]);

  if (props.route.section !== "home") {
    return <Kops1Design {...props} innerTitle={innerTitleForRoute(props)} />;
  }

  return (
    <div
      className="karpen-1-design"
      ref={rootRef}
      style={{ "--karpen-portrait-accent": accent } as CSSProperties}
    >
      <Kops1Design {...props} />

      <style jsx global>{`
        .karpen-1-design {
          --karpen-panel-offset: 0px;
          --karpen-image-offset: 0px;
          --karpen-copy-offset: 0px;
        }

        .karpen-1-design .lens-portrait-site main {
          position: relative;
          isolation: isolate;
          overflow: visible !important;
        }

        .karpen-1-design .lens-hero {
          position: sticky;
          top: 0;
          z-index: 10;
          transform: translate3d(0, var(--karpen-panel-offset), 0);
          transform-origin: center top;
          transition: none !important;
          will-change: transform;
        }

        .karpen-1-design .lens-photo img {
          transform: translate3d(0, var(--karpen-image-offset), 0) scale(1.055);
          transform-origin: center center;
          transition: none !important;
          will-change: transform;
        }

        .karpen-1-design .lens-info {
          transform: translate3d(0, var(--karpen-copy-offset), 0);
          transition: none !important;
          will-change: transform;
        }

        .karpen-1-design .lens-group {
          position: relative;
          z-index: 20;
          background: var(--karpen-portrait-accent, #5d5b91) !important;
          color: #fff;
          box-shadow: 0 -20px 46px rgba(0, 0, 0, 0.09);
        }

        .karpen-1-design .lens-footer {
          position: relative;
          z-index: 30;
        }

        @media (max-width: 720px), (prefers-reduced-motion: reduce) {
          .karpen-1-design .lens-hero {
            position: relative;
            top: auto;
            transform: none !important;
            will-change: auto;
          }

          .karpen-1-design .lens-photo img,
          .karpen-1-design .lens-info {
            transform: none !important;
            will-change: auto;
          }
        }
      `}</style>
    </div>
  );
}
