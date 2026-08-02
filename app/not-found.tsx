import Link from "next/link";

export default function NotFound() {
  return (
    <main className="not-found">
      <p className="eyebrow">Concept not found</p>
      <h1>This PI record does not exist yet.</h1>
      <p>The platform is working, but no content has been assigned to this name.</p>
      <Link href="/">Return to platform</Link>
    </main>
  );
}
