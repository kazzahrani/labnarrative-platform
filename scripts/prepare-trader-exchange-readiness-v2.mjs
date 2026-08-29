import fs from "node:fs";
import path from "node:path";

const connectionsPath = path.join(process.cwd(), "app", "trader", "ConnectionsSettings.tsx");
const unifiedPath = path.join(process.cwd(), "app", "trader", "ExchangeConnectionsV2.tsx");
if (!fs.existsSync(connectionsPath) || !fs.existsSync(unifiedPath)) throw new Error("Exchange readiness V2 targets missing");

const output = `"use client";\n\nexport { default } from "./ExchangeConnectionsV2";\n`;
fs.writeFileSync(connectionsPath, output);
console.log("Prepared unified six-exchange trading readiness workspace; no execution routing changed.");
