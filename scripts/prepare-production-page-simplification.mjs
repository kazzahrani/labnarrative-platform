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

const lines = source.split("\n");
const productionQueueIndex = lines.findIndex((line) => (
  line.includes("renderProspectTable") && line.includes('"Production queue"')
));
const pipelineHistoryIndex = lines.findIndex((line) => (
  line.includes("renderProspectTable") && line.includes('"Pipeline history"')
));

if (productionQueueIndex === -1) {
  throw new Error("The Production queue table was not found.");
}
if (pipelineHistoryIndex === -1) {
  throw new Error("The Pipeline history table was not found.");
}

if (pipelineHistoryIndex > productionQueueIndex) {
  const [pipelineHistoryLine] = lines.splice(pipelineHistoryIndex, 1);
  const currentQueueIndex = lines.findIndex((line) => (
    line.includes("renderProspectTable") && line.includes('"Production queue"')
  ));
  lines.splice(currentQueueIndex, 0, pipelineHistoryLine);
}

source = lines.join("\n");

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

const finalQueueIndex = source.indexOf('"Production queue"');
const finalHistoryIndex = source.indexOf('"Pipeline history"');
if (finalHistoryIndex === -1 || finalQueueIndex === -1 || finalHistoryIndex > finalQueueIndex) {
  throw new Error("Pipeline history was not placed above Production queue.");
}

fs.writeFileSync(pageUrl, source);
console.log("Production Engine simplified with Pipeline history above Production queue.");
