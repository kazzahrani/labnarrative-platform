import type { ReactNode } from "react";

export default function ConceptsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <style>{`
        /* Websites outreach mirrors the compact Systems / Intelligence language controls.
           Message drafts remain in state and copy normally, but are not rendered as text blocks. */
        main div:has(> [dir="ltr"]):has(> [dir="rtl"]) {
          display: flex !important;
          grid-template-columns: none !important;
          align-items: center !important;
          gap: 8px !important;
          margin-top: 12px !important;
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
          min-width: 44px !important;
          padding: 7px 11px !important;
          border-radius: 8px !important;
          font-size: 0 !important;
          line-height: 1 !important;
        }

        main [dir="ltr"] button::after {
          content: "EN";
          font-size: .68rem;
          font-weight: 850;
        }

        main [dir="rtl"] button::after {
          content: "AR";
          font-size: .68rem;
          font-weight: 850;
        }

        @media (max-width: 720px) {
          main div:has(> [dir="ltr"]):has(> [dir="rtl"]) {
            flex-direction: row !important;
          }
        }
      `}</style>
      {children}
    </>
  );
}
