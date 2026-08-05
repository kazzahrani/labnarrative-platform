import fs from "node:fs";

const pages = {
  automation: new URL("../app/admin/automation/page.tsx", import.meta.url),
  discovery: new URL("../app/admin/discovery/page.tsx", import.meta.url),
  websites: new URL("../app/admin/sites/page.tsx", import.meta.url),
};

const copy = {
  automation: "Builds one PI website at a time, fixes QA issues automatically, and holds completed concepts for your review. Unresolved cases move to Waiting for manual fix.",
  discovery: "Finds and verifies suitable PIs, removes duplicates, checks existing websites, and approves qualified candidates for production.",
  websites: "Shows each website’s status and domain connection. Archived websites are hidden by default.",
};

function update(url, transform) {
  const source = fs.readFileSync(url, "utf8");
  const result = transform(source);
  fs.writeFileSync(url, result);
  return result;
}

const automation = update(pages.automation, (source) => source.replace(
  /<p className=\{styles\.heroCopy\}>[\s\S]*?<\/p>/,
  `<p className={styles.heroCopy}>${copy.automation}</p>`,
));

const discovery = update(pages.discovery, (source) => source.replace(
  /<p className=\{styles\.heroCopy\}>[\s\S]*?<\/p>/,
  `<p className={styles.heroCopy}>${copy.discovery}</p>`,
));

const websites = update(pages.websites, (source) => source.replace(
  /<p>\s*Website status and domain status are shown separately\.[\s\S]*?the default operational table\.\s*<\/p>/,
  `<p>${copy.websites}</p>`,
));

for (const [source, expected, label] of [
  [automation, copy.automation, "Production Engine"],
  [discovery, copy.discovery, "Prospects Discovery"],
  [websites, copy.websites, "Websites Monitor"],
]) {
  if (!source.includes(expected)) {
    throw new Error(`${label} concise description was not applied.`);
  }
}

for (const legacy of [
  "The automation builds one website at a time",
  "The engine runs persistent background campaigns",
  "Website status and domain status are shown separately",
]) {
  if (automation.includes(legacy) || discovery.includes(legacy) || websites.includes(legacy)) {
    throw new Error(`A legacy long description remains: ${legacy}`);
  }
}

console.log("Concise Production, Discovery and Websites descriptions prepared.");
