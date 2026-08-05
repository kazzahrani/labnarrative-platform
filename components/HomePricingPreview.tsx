"use client";

const pricing = [
  { label: "Essential websites", price: "from $750" },
  { label: "Professional laboratory websites", price: "from $1,050" },
  { label: "Annual Care", price: "$300/year" },
];

export default function HomePricingPreview() {
  return (
    <section
      className="ln-home-pricing-preview"
      id="pricing"
      data-ln-overlap-panel="pricing"
    >
      <div className="ln-home-pricing-heading">
        <p>Pricing</p>
        <h2>Clear, transparent pricing</h2>
      </div>

      <div className="ln-home-pricing-details">
        <div className="ln-home-pricing-list">
          {pricing.map((item) => (
            <div className="ln-home-pricing-row" key={item.label}>
              <span>{item.label}</span>
              <strong>{item.price}</strong>
            </div>
          ))}
        </div>

        <a className="ln-home-pricing-link" href="/packages">
          Compare packages <span aria-hidden="true">→</span>
        </a>
      </div>

      <style jsx>{`
        .ln-home-pricing-preview {
          display: grid;
          grid-template-columns: minmax(0, 0.8fr) minmax(420px, 1.2fr);
          gap: clamp(64px, 10vw, 160px);
          padding: clamp(88px, 10vw, 148px) clamp(24px, 4.4vw, 70px);
          background: var(--paper, #f8f8f5);
          color: var(--ink, #192126);
        }

        .ln-home-pricing-heading > p {
          margin: 0;
          color: var(--green, #284c3d);
          font-size: 0.61rem;
          font-weight: 800;
          letter-spacing: 0.22em;
          text-transform: uppercase;
        }

        .ln-home-pricing-heading h2 {
          max-width: 720px;
          margin: clamp(42px, 5vw, 68px) 0 0;
          font-size: clamp(3rem, 5.4vw, 5.6rem);
          font-weight: 400;
          letter-spacing: -0.065em;
          line-height: 0.98;
        }

        .ln-home-pricing-details {
          align-self: end;
        }

        .ln-home-pricing-list {
          border-top: 1px solid var(--line, #dfe3e2);
        }

        .ln-home-pricing-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 32px;
          align-items: baseline;
          padding: 24px 0;
          border-bottom: 1px solid var(--line, #dfe3e2);
        }

        .ln-home-pricing-row span {
          color: var(--muted, #507163);
          font-size: clamp(0.83rem, 1vw, 0.96rem);
        }

        .ln-home-pricing-row strong {
          font-family: Georgia, "Times New Roman", serif;
          font-size: clamp(1.45rem, 2.2vw, 2.15rem);
          font-weight: 400;
          letter-spacing: -0.045em;
          white-space: nowrap;
        }

        .ln-home-pricing-link {
          display: inline-flex;
          align-items: center;
          gap: 28px;
          margin-top: 38px;
          padding-bottom: 7px;
          border-bottom: 1px solid var(--green, #284c3d);
          color: var(--green, #284c3d);
          font-size: 0.72rem;
          font-weight: 800;
          transition: gap 160ms ease, opacity 160ms ease;
        }

        .ln-home-pricing-link:hover {
          gap: 36px;
          opacity: 0.65;
        }

        @media (max-width: 900px) {
          .ln-home-pricing-preview {
            grid-template-columns: 1fr;
            gap: 70px;
          }

          .ln-home-pricing-details {
            max-width: 760px;
          }
        }

        @media (max-width: 520px) {
          .ln-home-pricing-preview {
            gap: 54px;
            padding-right: 20px;
            padding-left: 20px;
          }

          .ln-home-pricing-heading h2 {
            font-size: clamp(2.7rem, 13vw, 4rem);
          }

          .ln-home-pricing-row {
            grid-template-columns: 1fr;
            gap: 10px;
          }

          .ln-home-pricing-row strong {
            white-space: normal;
          }
        }
      `}</style>
    </section>
  );
}
