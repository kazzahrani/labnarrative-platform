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
  const pi = props.site.members?.[0];
  const portrait = safeAsset(pages.home.piImage || pages.home.topPortrait || pi?.image);
  const piName = pages.home.piName || props.site.piName;
  const piRole = pages.home.piRole || pi?.role || props.site.title;
  const overview = pages.home.piBiography || pages.home.overview || pi?.bio || props.site.introduction;

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
          background: #f1eee7 !important;
          color: #102e2d !important;
          overflow: hidden !important;
        }

        .narita-3-shell .narita-route-home main > section:first-of-type > *:not(.narita-3-pi-hero) {
          display: none !important;
        }

        .narita-3-shell .narita-route-home main > section:first-of-type::before {
          background: #f1eee7 !important;
          box-shadow: none !important;
        }

        .narita-3-pi-hero {
          box-sizing: border-box;
          width: min(1320px, calc(100% - 2 * var(--ciribilli-gutter, 48px)));
          height: 100%;
          min-height: inherit;
          margin: 0 auto;
          display: grid;
          grid-template-columns: minmax(280px, 0.78fr) minmax(0, 1.22fr);
          gap: clamp(48px, 7vw, 112px);
          align-items: center;
          padding: clamp(42px, 6svh, 74px) 0;
        }

        .narita-3-pi-portrait {
          width: min(100%, 520px);
          justify-self: start;
          aspect-ratio: 4 / 5;
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
          max-width: 760px;
          align-self: center;
        }

        .narita-3-eyebrow {
          margin: 0 0 18px;
          font-family: Arial, Helvetica, sans-serif;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: #6d7d78;
        }

        .narita-3-pi-copy h1 {
          margin: 0;
          max-width: 760px;
          font-family: Georgia, "Times New Roman", serif;
          font-size: clamp(54px, min(7vw, 9svh), 102px);
          font-weight: 400;
          line-height: 0.94;
          letter-spacing: -0.045em;
          color: #103b3a;
        }

        .narita-3-pi-copy h2 {
          margin: 24px 0 0;
          font-family: Arial, Helvetica, sans-serif;
          font-size: clamp(14px, 1.4vw, 19px);
          font-weight: 600;
          line-height: 1.35;
          letter-spacing: 0.04em;
          color: #244c49;
        }

        .narita-3-institution {
          margin: 8px 0 0;
          font-family: Arial, Helvetica, sans-serif;
          font-size: 13px;
          line-height: 1.5;
          color: #687773;
        }

        .narita-3-overview {
          max-width: 680px;
          margin-top: clamp(28px, 4svh, 46px);
          padding-top: 24px;
          border-top: 1px solid rgba(16, 59, 58, 0.22);
          font-family: Georgia, "Times New Roman", serif;
          font-size: clamp(18px, 1.8vw, 25px);
          line-height: 1.55;
          color: #24413f;
        }

        @media (max-width: 880px) {
          .narita-3-pi-hero {
            grid-template-columns: minmax(210px, 0.72fr) minmax(0, 1.28fr);
            gap: 36px;
            width: calc(100% - 48px);
          }

          .narita-3-pi-copy h1 {
            font-size: clamp(45px, 7.8vw, 74px);
          }
        }

        @media (max-width: 700px) {
          .narita-3-shell .narita-route-home main > section:first-of-type {
            height: auto !important;
            min-height: calc(100svh - var(--narita-header-height)) !important;
          }

          .narita-3-pi-hero {
            width: calc(100% - 40px);
            min-height: calc(100svh - var(--narita-header-height));
            grid-template-columns: 1fr;
            gap: 28px;
            align-content: center;
            padding: 34px 0 44px;
          }

          .narita-3-pi-portrait {
            width: min(58vw, 280px);
            aspect-ratio: 4 / 4.7;
          }

          .narita-3-pi-copy h1 {
            font-size: clamp(42px, 13vw, 64px);
          }

          .narita-3-pi-copy h2 {
            margin-top: 18px;
          }

          .narita-3-overview {
            margin-top: 22px;
            padding-top: 18px;
            font-size: 18px;
          }
        }
      `}</style>
    </div>
  );
}
