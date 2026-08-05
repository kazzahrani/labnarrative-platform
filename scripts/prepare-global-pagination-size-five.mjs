import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const adminRoot = new URL("../app/admin/", import.meta.url);
const adminPath = fileURLToPath(adminRoot);

function collectTsxFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectTsxFiles(entryPath);
    return entry.isFile() && entry.name.endsWith(".tsx") ? [entryPath] : [];
  });
}

let updatedFiles = 0;
let paginationControls = 0;

for (const filePath of collectTsxFiles(adminPath)) {
  let source = fs.readFileSync(filePath, "utf8");
  const original = source;

  source = source.replace(
    /type ([A-Za-z][A-Za-z0-9]*PageSize) = 10 \| 25 \| 50;/g,
    "type $1 = 5 | 10 | 25 | 50;",
  );

  source = source.replace(
    /(<select[\s\S]*?aria-label=\{label \+ " rows per page"\}[\s\S]*?)(<option value=\{10\}>10<\/option>)/g,
    (match, prefix, tenOption) => {
      if (prefix.includes("<option value={5}>5</option>")) return match;
      return `${prefix}<option value={5}>5</option>\n            ${tenOption}`;
    },
  );

  const pageSizeSelects = source.match(/aria-label=\{label \+ " rows per page"\}/g) ?? [];
  paginationControls += pageSizeSelects.length;

  if (source !== original) {
    fs.writeFileSync(filePath, source);
    updatedFiles += 1;
  }
}

if (paginationControls === 0) {
  throw new Error("No admin pagination controls were found.");
}

for (const filePath of collectTsxFiles(adminPath)) {
  const source = fs.readFileSync(filePath, "utf8");
  if (/type [A-Za-z][A-Za-z0-9]*PageSize = 10 \| 25 \| 50;/.test(source)) {
    throw new Error(`A page-size type still excludes 5: ${filePath}`);
  }

  const selectBlocks = source.match(/<select[\s\S]*?aria-label=\{label \+ " rows per page"\}[\s\S]*?<\/select>/g) ?? [];
  for (const block of selectBlocks) {
    if (!block.includes("<option value={5}>5</option>")) {
      throw new Error(`A pagination selector still excludes 5: ${filePath}`);
    }
    if (!block.includes("<option value={10}>10</option>")) {
      throw new Error(`A pagination selector lost its 10-row option: ${filePath}`);
    }
  }
}

console.log(`Page size 5 added across ${paginationControls} reusable admin pagination controls in ${updatedFiles} generated files.`);
