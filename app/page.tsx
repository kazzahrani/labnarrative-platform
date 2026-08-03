import Link from "next/link";

const primaryButtonStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "50px",
  padding: "13px 20px",
  border: "1px solid #17211e",
  background: "#17211e",
  color: "#ffffff",
  fontSize: "0.88rem",
  fontWeight: 800,
  textDecoration: "none",
} as const;

export default function PlatformHome() {
  return (
    <main className="platform-home">
      <header className="platform-header">
        <span className="platform-wordmark">LabNarrative</span>
        <span className="status-pill">Scientific website platform</span>
      </header>

      <section className="platform-hero">
        <p className="eyebrow">LabNarrative operations</p>
        <h1>One platform. Clear control.</h1>
        <p>
          Monitor every PI website and review its publishing, design, and domain status from one place.
        </p>

        <nav
          aria-label="Platform actions"
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "12px",
            marginTop: "36px",
          }}
        >
          <Link href="/admin/sites" style={primaryButtonStyle}>
            Website monitor →
          </Link>
        </nav>
      </section>

      <section className="architecture-note">
        <span>Workspace</span>
        <p>
          PI websites remain stored securely in Supabase and rendered dynamically by the same
          LabNarrative application.
        </p>
      </section>
    </main>
  );
}
