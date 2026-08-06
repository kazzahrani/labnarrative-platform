import fs from "node:fs";
import path from "node:path";

const pagePath = path.join(process.cwd(), "app/admin/sites/page.tsx");
let source = fs.readFileSync(pagePath, "utf8");

if (source.includes("data-monitor-sign-out")) {
  console.log("Websites Monitor header already matches the shared admin navigation.");
  process.exit(0);
}

const headerPattern = /      <header className=\{styles\.topbar\}>[\s\S]*?      <\/header>/;

if (!headerPattern.test(source)) {
  throw new Error("Could not locate the Websites Monitor header.");
}

const header = `      <header className={styles.topbar}>
        <div>
          <Link className={styles.brand} href="/">LabNarrative</Link>
          <span>Websites Monitor</span>
        </div>
        <nav>
          <Link href="/admin/discovery">Discovery</Link>
          <Link href="/admin/automation">Production</Link>
          <button
            data-monitor-sign-out
            type="button"
            onClick={() => void supabase.auth.signOut()}
          >
            Sign out
          </button>
        </nav>
      </header>`;

source = source.replace(headerPattern, header);
fs.writeFileSync(pagePath, source);
console.log("Websites Monitor header unified with Discovery and Production.");
