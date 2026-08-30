import fs from "node:fs";
import path from "node:path";

const file = path.join(process.cwd(), "app", "trader", "ConnectionsSettings.tsx");
if (!fs.existsSync(file)) throw new Error("Connections final target missing");

const source = `"use client";

import ExchangeConnectionsSimple from "./ExchangeConnectionsSimple";

type RealAccount = {
  id: string;
  name: string;
  exchangeStatus?: string;
  apiKeyLast4?: string | null;
} | null;

type Props = {
  realAccount: RealAccount;
  onConnectBinance: () => void;
  onBackOverview: () => void;
};

export default function ConnectionsSettings(props: Props) {
  return <ExchangeConnectionsSimple {...props} />;
}
`;

fs.writeFileSync(file, source);
console.log("Prepared simple four-exchange Connections workspace.");

// These must run last: legacy Trader transforms rewrite the DCA source, shell and
// chart workstation earlier in the build. Apply provider execution UI after them.
await import("./prepare-trader-multiexchange-selector-anchor.mjs");
await import("./prepare-trader-multiexchange-execution-ui.mjs");
await import("./prepare-trader-multiexchange-shell-ui.mjs");
await import("./prepare-trader-multiexchange-chart-ui.mjs");
