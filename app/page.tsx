import Link from "next/link";
import { getAllSites } from "@/lib/sites";

export default async function PlatformHome() {
  const sites = await getAllSites();

  return (
    <main className="platform-home">
      <header className="platform-header">
        <span className="platform-wordmark">LabNarrative</span>
        <span className="status-pill">Platform core v0.2</span>
      </header>

      <section className="platform-hero">
        <p className="eyebrow">Database-connected multi-tenant platform</p>
        <h1>One platform. Many scientific identities.</h1>
        <p>
          Every concept below is loaded from the LabNarrative database and rendered by the same
          application. Adding another PI now means adding a database record—not another codebase.
        </p>
      </section>

      <section className="platform-grid" aria-label="Pilot concepts">
        {sites.map((site) => (
          <Link className="platform-card" href={`/sites/${site.slug}`} key={site.slug}>
            <span className="platform-card-label">{site.slug}.labnarrative.com</span>
            <h2>{site.labName}</h2>
            <p>{site.headline}</p>
            <span className="open-label">Open concept →</span>
          </Link>
        ))}
      </section>

      <section className="architecture-note">
        <span>Current stage</span>
        <p>PI content is now stored securely in Supabase and loaded dynamically by Vercel.</p>
      </section>
    </main>
  );
}
