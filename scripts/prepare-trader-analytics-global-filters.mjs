import fs from "node:fs";
import path from "node:path";

const analyticsPath = path.join(process.cwd(), "app", "trader", "Analytics.tsx");
const cssPath = path.join(process.cwd(), "app", "trader", "analytics.module.css");
for (const target of [analyticsPath, cssPath]) if (!fs.existsSync(target)) throw new Error(`Analytics global-filter target missing: ${target}`);

let source = fs.readFileSync(analyticsPath, "utf8");

function replaceOnce(from, to, label) {
  if (!source.includes(from)) throw new Error(`Analytics global filters missing ${label}`);
  source = source.replace(from, to);
}

const capitalBlock = `      const { data: capitalData } = await browserSupabase.functions.invoke("trader-analytics-capital", { body: { accountId, range } });
      if (requestId !== requestIdRef.current) return;
      const capitalResponse = (capitalData ?? {}) as CapitalResponse;
      const capitalById = new Map((capitalResponse.automations ?? []).map((item) => [item.id, item]));
      const enrichedAutomations = (response.automations ?? []).map((item) => ({ ...item, ...(capitalById.get(item.id) ?? {}) }));
      setSummary({ ...response.summary, capitalUsed: capitalResponse.summaryCapitalUsed ?? 0 });
      setOverallSeries(response.series ?? []);
      setAutomations(enrichedAutomations);
      setError("");
      setSelectedId((current) => current === "all" || enrichedAutomations.some((item) => item.id === current) ? current : "all");`;

const filteredBlock = `      const { data: filteredData, error: filteredError } = await browserSupabase.rpc("trader_analytics_filtered_summary", {
        p_account_id: accountId,
        p_range: range,
        p_scope: scope,
        p_type: type,
      });
      if (filteredError) throw filteredError;
      if (requestId !== requestIdRef.current) return;
      const filteredResponse = (filteredData ?? {}) as { botIds?: string[]; summary?: Summary; series?: SeriesPoint[] };
      const filteredIds = new Set(filteredResponse.botIds ?? []);
      const { data: capitalData } = await browserSupabase.functions.invoke("trader-analytics-capital", { body: { accountId, range } });
      if (requestId !== requestIdRef.current) return;
      const capitalResponse = (capitalData ?? {}) as CapitalResponse;
      const capitalById = new Map((capitalResponse.automations ?? []).map((item) => [item.id, item]));
      const enrichedAutomations = (response.automations ?? []).map((item) => ({ ...item, ...(capitalById.get(item.id) ?? {}) }));
      const filteredAutomations = enrichedAutomations.filter((item) => filteredIds.has(item.id));
      const filteredCapitalUsed = filteredAutomations.reduce((sum, item) => sum + (item.capitalUsed != null && Number.isFinite(item.capitalUsed) ? item.capitalUsed : 0), 0);
      const filteredSummary = filteredResponse.summary ?? response.summary;
      setSummary({ ...filteredSummary, capitalUsed: filteredCapitalUsed });
      setOverallSeries(filteredResponse.series ?? []);
      setAutomations(filteredAutomations);
      setError("");
      setSelectedId("all");`;
replaceOnce(capitalBlock, filteredBlock, "filtered aggregate load block");

replaceOnce("  }, [accountId, range]);", "  }, [accountId, range, scope, type]);", "load dependencies");

replaceOnce(
  '  const selectedName = selected?.name || "All automations";',
  '  const selectedName = selected?.name || "Filtered automations";',
  "aggregate chart title",
);

replaceOnce(
  '      if (scope === "running" && (item.archived || item.status !== "Running")) return false;\n      if (scope === "archived" && !item.archived) return false;',
  '      if (scope === "running" && (item.archived || item.status !== "Running")) return false;\n      if (scope === "paused" && (item.archived || item.status === "Running")) return false;\n      if (scope === "archived" && !item.archived) return false;',
  "paused table predicate",
);

const headingAnchor = `    </div>\n\n    {error && <div className={styles.error}>`;
const globalFilters = `    </div>\n\n    <section className={styles.globalFilters} data-analytics-motion>\n      <div><small>BOT FILTERS</small><strong>Analytics scope</strong><span>Every metric and figure below uses this bot set.</span></div>\n      <div className={styles.globalFilterControls}>\n        <label><span>Status</span><select value={scope} onChange={(event) => setScope(event.target.value)} aria-label="Analytics bot status"><option value="all">All statuses</option><option value="running">Running</option><option value="paused">Paused</option><option value="archived">Archived</option></select></label>\n        <label><span>Automation</span><select value={type} onChange={(event) => setType(event.target.value)} aria-label="Analytics automation type"><option value="all">All types</option><option value="DCA">DCA</option><option value="Strategy Execution">Strategy Execution</option></select></label>\n      </div>\n    </section>\n\n    {error && <div className={styles.error}>`;
replaceOnce(headingAnchor, globalFilters, "top filter insertion");

const oldScopeSelect = '<select value={scope} onChange={(event) => setScope(event.target.value)} aria-label="Automation state"><option value="all">All automations</option><option value="running">Running</option><option value="archived">Archived</option></select>';
const oldTypeSelect = '<select value={type} onChange={(event) => setType(event.target.value)} aria-label="Automation type"><option value="all">All types</option><option value="DCA">DCA</option><option value="Strategy Execution">Strategy Execution</option></select>';
replaceOnce(oldScopeSelect, "", "old table status filter");
replaceOnce(oldTypeSelect, "", "old table type filter");

const botPickerPattern = /<div className=\{styles\.botPicker\}><button type="button" className=\{selectedId === "all"[\s\S]*?<\/div>/;
if (!botPickerPattern.test(source)) throw new Error("Analytics global filters missing per-bot chart picker");
source = source.replace(botPickerPattern, "");

const combinedHandler = 'onClick={() => { setSelectedId(item.id); setWorkspaceId(item.id); }}';
if (!source.includes(combinedHandler)) throw new Error("Analytics global filters missing workspace click handler");
source = source.replaceAll(combinedHandler, 'onClick={() => setWorkspaceId(item.id)}');

const cssMarker = "ANALYTICS_GLOBAL_FILTERS_V1";
let css = fs.readFileSync(cssPath, "utf8");
if (!css.includes(cssMarker)) css += `\n/* ${cssMarker} */\n.globalFilters{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:12px 14px;border:1px solid #333;border-radius:12px;background:#202020}.globalFilters>div:first-child{min-width:0}.globalFilters>div:first-child small{display:block;color:#707070;font-size:8px;font-weight:800;letter-spacing:.12em}.globalFilters>div:first-child strong{display:block;margin-top:3px;color:#d8d8d8;font-size:12px}.globalFilters>div:first-child span{display:block;margin-top:2px;color:#727272;font-size:8px}.globalFilterControls{display:flex;align-items:flex-end;gap:8px}.globalFilterControls label{display:grid;gap:4px}.globalFilterControls label>span{color:#747474;font-size:8px;font-weight:700}.globalFilterControls select{height:34px;min-width:170px;padding:0 30px 0 10px;border:1px solid #3a3a3a;border-radius:8px;background:#252525;color:#d6d6d6;font:inherit;font-size:10px;outline:none}.globalFilterControls select:focus{border-color:#555}.compareControls:has(input:only-child){min-width:min(100%,260px)}@media(max-width:720px){.globalFilters{align-items:stretch;flex-direction:column}.globalFilterControls{width:100%}.globalFilterControls label{flex:1}.globalFilterControls select{width:100%;min-width:0}}\n`;

for (const marker of [
  'trader_analytics_filtered_summary',
  'p_scope: scope',
  'p_type: type',
  'const filteredAutomations =',
  'setSelectedId("all")',
  'option value="paused">Paused',
  'className={styles.globalFilters}',
  'Filtered automations',
  'onClick={() => setWorkspaceId(item.id)}',
]) if (!source.includes(marker)) throw new Error(`Analytics global-filter output missing ${marker}`);
if (source.includes('aria-label="Automation state"') || source.includes('aria-label="Automation type"')) throw new Error("Analytics table still contains global status/type filters");
if (source.includes('className={styles.botPicker}')) throw new Error("Analytics overview still contains per-bot chart picker");
if (source.includes(combinedHandler)) throw new Error("Analytics overview still changes aggregate selection on bot click");

fs.writeFileSync(analyticsPath, source);
fs.writeFileSync(cssPath, css);
console.log("Prepared page-wide Analytics bot filters with filtered aggregate metrics and charts.");
