import fs from "node:fs";
import path from "node:path";

const target = path.join(process.cwd(), "app", "trader", "ExchangeConnectionsV2.tsx");
if (!fs.existsSync(target)) throw new Error("ExchangeConnectionsV2 target missing");
let source = fs.readFileSync(target, "utf8");

const helperAnchor = `  return result;\n}\n\nexport default function ExchangeConnectionsV2`;
if (!source.includes(helperAnchor)) throw new Error("Kraken V2 helper anchor missing");
source = source.replace(helperAnchor, `  return result;\n}\n\nasync function invokeKraken(action: string, extra: Record<string, unknown> = {}) {\n  const { data, error } = await browserSupabase.functions.invoke("trader-kraken-trade-control", { body: { action, ...extra } });\n  if (error) {\n    let message = error.message || "kraken_control_failed";\n    const context = (error as { context?: Response }).context;\n    if (context) {\n      try { const payload = await context.clone().json() as { error?: string }; if (payload.error) message = payload.error; } catch {}\n    }\n    throw new Error(message);\n  }\n  const result = (data ?? {}) as StatusResponse & DiagnosticsResponse & { connection?: Connection; check?: Check };\n  if (result.error || result.ok !== true) throw new Error(result.error || "kraken_control_failed");\n  return result;\n}\n\nexport default function ExchangeConnectionsV2`);

const saveAnchor = `      const result = await invoke("upgrade", payload);\n      setConnections((current) => ({ ...current, [modal]: result.connection ?? null }));\n      const diag = await invoke("diagnostics", { provider: modal }) as DiagnosticsResponse & { check?: Check };`;
if (!source.includes(saveAnchor)) throw new Error("Kraken V2 save anchor missing");
source = source.replace(saveAnchor, `      const result = modal === "kraken" ? await invokeKraken("upgrade", payload) : await invoke("upgrade", payload);\n      setConnections((current) => ({ ...current, [modal]: result.connection ?? null }));\n      const diag = modal === "kraken"\n        ? await invokeKraken("diagnostics") as DiagnosticsResponse & { check?: Check }\n        : await invoke("diagnostics", { provider: modal }) as DiagnosticsResponse & { check?: Check };`);

const errorAnchor = `["invalid_passphrase", "The exchange rejected the API passphrase."],`;
if (!source.includes(errorAnchor)) throw new Error("Kraken V2 error anchor missing");
source = source.replace(errorAnchor, `${errorAnchor}\n    ["kraken_invalid_private_key_format", "Kraken Private Key format was not recognized. Copy the full Private Key exactly as Kraken generated it."],\n    ["kraken_api:EAPI:Invalid key", "Kraken rejected the API Key. Copy the current API Key from the same Kraken key pair."],\n    ["kraken_api:EAPI:Invalid signature", "Kraken rejected the Private Key/signature. Copy the full Private Key from the same Kraken API key pair."],\n    ["kraken_api:EGeneral:Permission denied", "Kraken denied this API key. Confirm Query Funds, Query Open/Closed Orders, Create & Modify Orders, and Cancel & Close Orders are enabled."],`);

fs.writeFileSync(target, source);
console.log("Prepared isolated Kraken trade credential verification without changing live execution routing.");
