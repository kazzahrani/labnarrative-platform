import fs from "node:fs";
import path from "node:path";

const traderPath = path.join(process.cwd(), "app/trader/TradingAgent.tsx");
let source = fs.readFileSync(traderPath, "utf8");

source = source.replace(/import \{([^}]+)\} from "react";/, (full, imports) => {
  const names = imports.split(",").map((name) => name.trim()).filter(Boolean);
  if (!names.includes("useRef")) names.push("useRef");
  return `import { ${names.join(", ")} } from "react";`;
});

fs.writeFileSync(traderPath, source);
console.log("Ensured useRef is imported for multi-pair DCA scanning.");
