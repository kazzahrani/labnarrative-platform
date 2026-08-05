import fs from "node:fs";

const pages = {
  automation: new URL("../app/admin/automation/page.tsx", import.meta.url),
  discovery: new URL("../app/admin/discovery/page.tsx", import.meta.url),
  monitor: new URL("../app/admin/sites/page.tsx", import.meta.url),
};

function updatePage(url, transform) {
  const current = fs.readFileSync(url, "utf8");
  const updated = transform(current);
  fs.writeFileSync(url, updated);
  return updated;
}

const automation = updatePage(pages.automation, (source) => source
  .replace("<h1>Automation Control Centre</h1>", "<h1>Production system</h1>")
  .replace('<span className={styles.muted}>Automation</span>', '<span className={styles.muted}>Production system</span>')
  .replace('<Link href="/admin/sites">Websites</Link>', '<Link href="/admin/sites">Websites monitor</Link>')
  .replace(/\s*<p className=\{styles\.kicker\}>Production system · Ciribilli Narita v1<\/p>\s*/, "\n            ")
  .replace("<h1>From prospect to live concept.</h1>", "<h1>Production system</h1>"));

const discovery = updatePage(pages.discovery, (source) => source
  .replace("<h1>Prospect Discovery Engine</h1>", "<h1>Prospect discovery</h1>")
  .replace('<Link href="/admin/automation">Automation</Link>', '<Link href="/admin/automation">Production system</Link>')
  .replace('<Link href="/admin/sites">Websites</Link>', '<Link href="/admin/sites">Websites monitor</Link>')
  .replace(/\s*<p className=\{styles\.kicker\}>Engine 1 · automatic discovery<\/p>\s*/, "\n            ")
  .replace("<h1>Search, verify, and queue automatically.</h1>", "<h1>Prospect discovery</h1>")
  .replace("Open production queue", "Open production system"));

const monitor = updatePage(pages.monitor, (source) => source
  .replace("Preparing the secure website monitor…", "Preparing Websites monitor…")
  .replace('<p className={styles.kicker}>LabNarrative website monitor</p>', '<p className={styles.kicker}>Websites monitor</p>')
  .replace("<span>Website monitor</span>", "<span>Websites monitor</span>")
  .replace(/\s*<p className=\{styles\.kicker\}>Portfolio operations<\/p>\s*/, "\n            ")
  .replace("<h1>Monitor every PI website.</h1>", "<h1>Websites monitor</h1>"));

const checks = [
  [automation, "<h1>Production system</h1>", "Production system heading"],
  [automation, "Production system</span>", "Production system topbar label"],
  [discovery, "<h1>Prospect discovery</h1>", "Prospect discovery heading"],
  [discovery, "Open production system", "Production system action label"],
  [monitor, "<h1>Websites monitor</h1>", "Websites monitor heading"],
  [monitor, "<span>Websites monitor</span>", "Websites monitor topbar label"],
];

for (const [source, token, label] of checks) {
  if (!source.includes(token)) throw new Error(`${label} was not prepared.`);
}

for (const legacy of [
  "Engine 1 · automatic discovery",
  "Production system · Ciribilli Narita v1",
  "Portfolio operations",
  "From prospect to live concept.",
  "Search, verify, and queue automatically.",
  "Monitor every PI website.",
]) {
  if (automation.includes(legacy) || discovery.includes(legacy) || monitor.includes(legacy)) {
    throw new Error(`Legacy page heading remains: ${legacy}`);
  }
}

console.log("Admin page names standardized and hero headers simplified.");
