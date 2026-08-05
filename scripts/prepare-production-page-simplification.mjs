import fs from "node:fs";

const pageUrl = new URL("../app/admin/automation/page.tsx", import.meta.url);
let source = fs.readFileSync(pageUrl, "utf8");

source = source
  .split("\n")
  .filter((line) => !line.includes(">Check domain & continue</button>"))
  .filter((line) => !(line.includes("<span>Held") && line.includes("{counts.held}")))
  .filter((line) => !(line.includes("<span>Rejected") && line.includes("{counts.rejected}")))
  .filter((line) => !line.includes('{renderProspectTable("Held prospects'))
  .filter((line) => !line.includes('{renderProspectTable("Rejected prospects'))
  .join("\n");

if (source.includes(">Check domain & continue</button>")) {
  throw new Error("The manual domain-check button is still present.");
}
if (source.includes("{renderProspectTable(\"Held prospects")) {
  throw new Error("The Held prospects table is still present.");
}
if (source.includes("{renderProspectTable(\"Rejected prospects")) {
  throw new Error("The Rejected prospects table is still present.");
}
if (/\<span\>Held[^<]*\<\/span\>\<strong\>\{counts\.held\}\<\/strong\>/.test(source)) {
  throw new Error("The Held metric is still present.");
}
if (/\<span\>Rejected[^<]*\<\/span\>\<strong\>\{counts\.rejected\}\<\/strong\>/.test(source)) {
  throw new Error("The Rejected metric is still present.");
}

fs.writeFileSync(pageUrl, source);
console.log("Held and Rejected surfaces and the manual domain-check button were removed from Production Engine.");
