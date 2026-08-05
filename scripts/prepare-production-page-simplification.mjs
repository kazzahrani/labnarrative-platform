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
  .filter((line) => !line.includes('{renderProspectTable("Buildable prospects'))
  .filter((line) => !line.includes('{renderProspectTable("Active and completed records"'))
  .join("\n");

function removeSectionContaining(marker, label) {
  const markerIndex = source.indexOf(marker);
  if (markerIndex === -1) {
    throw new Error(`${label} marker was not found.`);
  }

  const sectionStart = source.lastIndexOf("<section", markerIndex);
  if (sectionStart === -1) {
    throw new Error(`${label} section start was not found.`);
  }

  const sectionEndStart = source.indexOf("</section>", markerIndex);
  if (sectionEndStart === -1) {
    throw new Error(`${label} section end was not found.`);
  }

  const sectionEnd = sectionEndStart + "</section>".length;
  source = `${source.slice(0, sectionStart)}${source.slice(sectionEnd)}`;
}

removeSectionContaining("<h3>Pipeline events</h3>", "Pipeline events");

if (source.includes(">Check domain & continue</button>")) {
  throw new Error("The manual domain-check button is still present.");
}
if (source.includes('{renderProspectTable("Held prospects')) {
  throw new Error("The Held prospects table is still present.");
}
if (source.includes('{renderProspectTable("Rejected prospects')) {
  throw new Error("The Rejected prospects table is still present.");
}
if (source.includes('{renderProspectTable("Buildable prospects')) {
  throw new Error("The Production queue table is still present.");
}
if (source.includes('{renderProspectTable("Active and completed records"')) {
  throw new Error("The Pipeline history table is still present.");
}
if (source.includes("<h3>Pipeline events</h3>")) {
  throw new Error("The Pipeline events card is still present.");
}
if (/\<span\>Held[^<]*\<\/span\>\<strong\>\{counts\.held\}\<\/strong\>/.test(source)) {
  throw new Error("The Held metric is still present.");
}
if (/\<span\>Rejected[^<]*\<\/span\>\<strong\>\{counts\.rejected\}\<\/strong\>/.test(source)) {
  throw new Error("The Rejected metric is still present.");
}

fs.writeFileSync(pageUrl, source);
console.log("Production Engine simplified without Pipeline history, Production queue or Pipeline events.");
