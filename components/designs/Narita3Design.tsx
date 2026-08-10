"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import CiribilliNaritaDesign from "@/components/designs/CiribilliNaritaDesign";
import { getBourdonPages, type LabSite, type SiteRoute } from "@/lib/sites";

export const NARITA_3_VARIANT = "narita-3-v1";

type Narita3DesignProps = {
  site: LabSite;
  route: SiteRoute;
  basePath: string;
  previewMode?: boolean;
};

function safeAsset(value?: string) {
  if (!value) return undefined;
  if (value.startsWith("/")) return value;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

export default function Narita3Design(props: Narita3DesignProps) {
  const shellRef = useRef<HTMLDivElement>(null);
  const [heroTarget, setHeroTarget] = useState<HTMLElement | null>(null);
  const pages = getBourdonPages(props.site);
  const homeOverview = (pages.home as typeof pages.home & { overview?: string }).overview;
  const pi = props.site.members?.[0];
  const portrait = safeAsset(pages.home.piImage || pages.home.topPortrait || pi?.image);
  const piName = pages.home.piName || props.site.piName;
  const piRole = pages.home.piRole || pi?.role || props.site.title;
  const overview = pages.home.piBiography || homeOverview || pi?.bio || props.site.introduction;

  useEffect(() => {
    if (props.route.section !== "home") {
      setHeroTarget(null);
      return;
    }

    const shell = shellRef.current;
    if (!shell) return;

    const findTarget = () => {
      const target = shell.querySelector<HTMLElement>(
        ".narita-route-home main > section:first-of-type",
      );
      setHeroTarget(target);
    };

    findTarget();
    const observer = new MutationObserver(findTarget);
    observer.observe(shell, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, [props.route.section]);

  if (props.route.section !== "home") {
    return <CiribilliNaritaDesign {...props} />;
  }

  return (
    <div className="narita-3-shell" ref={shellRef}>
      <CiribilliNaritaDesign {...props} />
      {heroTarget
        ? createPortal(
            <div className="narita-3-pi-hero">
              <div className="narita-3-pi-portrait">
                {portrait ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={portrait} alt={piName} />
                ) : (
                  <div className="narita-3-pi-placeholder" aria-hidden="true" />
                )}
              </div>
              <div className="narita-3-pi-copy">
                <p className="narita-3-eyebrow">Principal Investigator</p>
                <h1>{piName}</h1>
                {piRole && <h2>{piRole}</h2>}
                <p className="narita-3-institution">{props.site.institution}</p>
                {overview && <div className="narita-3-overview">{overview}</div>}
              </div>
            </div>,
            heroTarget,
          )
        : null}

      <style jsx global>{`
        .narita-3-shell .narita-route-home main > section:first-of-type {
          background: #ece9e4 !important;
          color: #102e2d !important;
          overflow: hidden !important;
          padding: 0 !important;
        }

        .narita-3-shell .narita-route-home main > section:first-of-type > *:not(.narita-3-pi-hero) {
          display: none !important;
        }

        .narita-3-shell .narita-route-home main > section:first-of-type::before {
          background: #ece9e4 !important;
          box-shadow: none !important;
        }

        .narita-3-pi-hero {
          width: 100%;
          max-width: none;
          height: 100%;
          min-height: inherit;
          margin: 0;
          display: grid;
          grid-template-columns: minmax(0, 54%) minmax(0, 46%);
          gap: 0;
          align-items: stretch;
        }

        .narita-3-pi-portrait {
          width: 100%;
          height: 100%;
          max-width: none;
          aspect-ratio: auto;
          overflow: hidden;
          background: #d7d5cf;
        }

        .narita-3-pi-portrait img,
        .narita-3-pi-placeholder {
          width: 100%;
          height: 100%;
          display: block;
          object-fit: cover;
          object-position: center 24%;
        }

        .narita-3-pi-copy {
          height: 100%;
          max-width: none;
          display: flex;
          flex-direction: column;
          justify-content: center;
          padding: clamp(52px, 6vw, 110px);
          background: #ece9e4;
        }

        .narita-3-eyebrow {
          margin: 0 0 18px;
          font-family: Arial, Helvetica, sans-serif;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: #243c3a;
        }

        .narita-3-pi-copy h1 {
          margin: 0;
          max-width: 8.5ch;
          font-family: Georgia, "Times New Roman", serif;
          font-size: clamp(64px, min(7.5vw, 10svh), 112px);
          font-weight: 400;
          line-height: 0.92;
          letter-spacing: -0.045em;
          color: #103b3a;
        }

        .narita-3-pi-copy h2 {
          margin: 26px 0 0;
          font-family: Arial, Helvetica, sans-serif;
          font-size: clamp(16px, 1.55vw, 22px);
          font-weight: 700;
          line-height: 1.35;
          letter-spacing: 0.04em;
          color: #5c6f6b;
          text-transform: uppercase;
        }

        .narita-3-institution {
          margin: 10px 0 0;
          font-family: Arial, Helvetica, sans-serif;
          font-size: 14px;
          line-height: 1.55;
          color: #6b7975;
        }

        .narita-3-overview {
          max-width: 760px;
          margin-top: 34px;
          font-family: Georgia, "Times New Roman", serif;
          font-size: clamp(19px, 2vw, 27px);
          line-height: 1.55;
          color: #223f3d;
        }

        @media (max-width: 980px) {
          .narita-3-pi-hero {
            grid-template-columns: 1fr 1fr;
          }

          .narita-3-pi-copy {
            padding: 42px;
          }

          .narita-3-pi-copy h1 {
            font-size: clamp(52px, 7vw, 84px);
            max-width: 9ch;
          }
        }

        @media (max-width: 700px) {
          .narita-3-shell .narita-route-home main > section:first-of-type {
            height: auto !important;
            min-height: calc(100svh - var(--narita-header-height)) !important;
          }

          .narita-3-pi-hero {
            min-height: calc(100svh - var(--narita-header-height));
            grid-template-columns: 1fr;
          }

          .narita-3-pi-portrait {
            min-height: 44svh;
          }

          .narita-3-pi-copy {
            padding: 32px 24px 40px;
          }

          .narita-3-pi-copy h1 {
            max-width: none;
            font-size: clamp(42px, 12vw, 64px);
          }

          .narita-3-pi-copy h2 {
            margin-top: 18px;
          }

          .narita-3-overview {
            margin-top: 24px;
            font-size: 18px;
          }
        }
      `}</style>
    </div>
  );
}
