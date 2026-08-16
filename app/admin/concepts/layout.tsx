import type { ReactNode } from "react";

export default function ConceptsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <style>{`
        /* Websites outreach mirrors compact Systems / Intelligence rows.
           Drafts stay stored/copyable but message bodies are never rendered. */
        main div:has(> [dir="ltr"]):has(> [dir="rtl"]) {
          display: flex !important;
          grid-template-columns: none !important;
          align-items: center !important;
          gap: 5px !important;
          margin: 0 !important;
        }

        main [dir="ltr"],
        main [dir="rtl"] {
          width: auto !important;
          min-height: 0 !important;
          padding: 0 !important;
          border: 0 !important;
          border-radius: 0 !important;
          background: transparent !important;
        }

        main [dir="ltr"] > p,
        main [dir="rtl"] > p,
        main [dir="ltr"] b,
        main [dir="rtl"] b {
          display: none !important;
        }

        main [dir="ltr"] > div,
        main [dir="rtl"] > div {
          display: block !important;
        }

        main [dir="ltr"] button,
        main [dir="rtl"] button {
          min-width: 38px !important;
          height: 32px !important;
          padding: 0 9px !important;
          border-radius: 8px !important;
          font-size: 0 !important;
          line-height: 30px !important;
        }

        main [dir="ltr"] button::after {
          content: "EN";
          font-size: .64rem;
          font-weight: 850;
        }

        main [dir="rtl"] button::after {
          content: "AR";
          font-size: .64rem;
          font-weight: 850;
        }

        /* Hard rule: one decision-maker = one full-width row. */
        main [class*="contactCards"] {
          display: grid !important;
          grid-template-columns: minmax(0, 1fr) !important;
          gap: 7px !important;
          width: 100% !important;
        }

        main [class*="contactCard"]:not([class*="contactCards"]) {
          display: grid !important;
          grid-template-columns: minmax(220px, 1fr) auto auto auto !important;
          align-items: center !important;
          column-gap: 7px !important;
          row-gap: 0 !important;
          width: 100% !important;
          min-height: 58px !important;
          padding: 10px 12px !important;
        }

        main [class*="contactTop"]:not([class*="contactTopActions"]) {
          display: contents !important;
          padding: 0 !important;
          border: 0 !important;
        }

        main [class*="contactTop"]:not([class*="contactTopActions"]) > div:first-child {
          min-width: 0 !important;
        }

        main [class*="contactTop"]:not([class*="contactTopActions"]) > div:first-child strong {
          font-size: .82rem !important;
          line-height: 1.2 !important;
        }

        main [class*="contactTop"]:not([class*="contactTopActions"]) > div:first-child span {
          margin-top: 3px !important;
          font-size: .63rem !important;
          line-height: 1.25 !important;
          white-space: nowrap !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
          max-width: 420px !important;
        }

        main [class*="contactTopActions"] {
          display: flex !important;
          align-items: center !important;
          gap: 5px !important;
          white-space: nowrap !important;
        }

        main [class*="contactTopActions"] a {
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          height: 32px !important;
          padding: 0 10px !important;
          border: 1px solid #29404b !important;
          border-radius: 8px !important;
          background: #172a34 !important;
          color: #e7efed !important;
          font-size: .63rem !important;
          font-weight: 850 !important;
        }

        main [class*="stateBadge"] {
          height: 32px !important;
          padding: 0 9px !important;
          display: inline-flex !important;
          align-items: center !important;
          font-size: .61rem !important;
        }

        main [class*="messageGrid"] {
          display: flex !important;
          align-items: center !important;
          gap: 5px !important;
          margin: 0 !important;
        }

        main [class*="contactFooter"] {
          display: flex !important;
          align-items: center !important;
          gap: 5px !important;
          margin: 0 !important;
          padding: 0 !important;
          border: 0 !important;
          white-space: nowrap !important;
        }

        main [class*="contactFooter"] > span {
          display: none !important;
        }

        main [class*="contactFooter"] button {
          height: 32px !important;
          padding: 0 10px !important;
          border-radius: 8px !important;
          font-size: .63rem !important;
          line-height: 30px !important;
          white-space: nowrap !important;
        }

        main [class*="contactFooter"] > b {
          min-height: 32px !important;
          display: inline-flex !important;
          align-items: center !important;
          padding: 0 9px !important;
          border: 1px solid #356b5a !important;
          border-radius: 8px !important;
          background: #183a31 !important;
          font-size: .61rem !important;
          white-space: nowrap !important;
        }

        main [class*="followupArea"] {
          display: flex !important;
          align-items: center !important;
          gap: 5px !important;
          margin: 0 !important;
          padding: 0 !important;
          border: 0 !important;
          border-radius: 0 !important;
          background: transparent !important;
          white-space: nowrap !important;
        }

        main [class*="followupArea"] > span {
          display: none !important;
        }

        @media (max-width: 980px) {
          main [class*="contactCard"]:not([class*="contactCards"]) {
            grid-template-columns: minmax(180px, 1fr) auto auto !important;
          }
          main [class*="contactFooter"] {
            grid-column: 2 / -1 !important;
            justify-content: flex-end !important;
          }
        }

        @media (max-width: 760px) {
          main [class*="contactCard"]:not([class*="contactCards"]) {
            display: flex !important;
            flex-wrap: wrap !important;
            align-items: center !important;
            gap: 6px !important;
          }
          main [class*="contactTop"]:not([class*="contactTopActions"]) {
            display: contents !important;
          }
          main [class*="contactTop"]:not([class*="contactTopActions"]) > div:first-child {
            flex: 1 1 100% !important;
            margin-bottom: 3px !important;
          }
          main [class*="contactTopActions"],
          main [class*="messageGrid"],
          main [class*="contactFooter"],
          main [class*="followupArea"] {
            flex: 0 0 auto !important;
            grid-column: auto !important;
            margin: 0 !important;
          }
        }
      `}</style>
      {children}
    </>
  );
}
