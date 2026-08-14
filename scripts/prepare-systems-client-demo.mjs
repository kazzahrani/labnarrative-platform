import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const cssPath = path.resolve(here, "../app/systems/demos/medical-masar/v2.module.css");
const clientPath = path.resolve(here, "../app/systems/demos/[slug]/ConceptDemoClient.tsx");
const baseMarker = "/* Dynamic Systems client demo support */";
const interactionMarker = "/* Dynamic Systems workflow interaction support */";

let css = fs.readFileSync(cssPath, "utf8");

if (!css.includes(baseMarker)) {
  css += `\n\n${baseMarker}\n.accountGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px}.accountCard{border:1px solid var(--line);border-radius:12px;background:var(--surface);padding:16px;box-shadow:var(--shadow)}.accountTop{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.accountTop h3{margin:0;font-size:.72rem}.accountTop p{margin:4px 0 0;color:var(--muted);font-size:.54rem}.accountCard>p{margin:12px 0 0;color:var(--muted);font-size:.56rem}.accountMeta{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin-top:14px}.accountMeta span{display:grid;gap:4px;padding:9px;border-radius:8px;background:var(--surface2);color:var(--muted2);font-size:.49rem}.accountMeta strong{color:var(--text);font-size:.56rem}.score{display:inline-grid;place-items:center;min-width:34px;height:26px;padding:0 8px;border-radius:999px;background:var(--surface3);color:var(--text);font-size:.56rem;font-weight:800}.scoreHigh{background:var(--lime,#aee94e);color:#17221b}.cellTitle{display:block;color:var(--text);font-size:.59rem;font-weight:800}.cellSub{display:block;margin-top:3px;color:var(--muted2);font-size:.5rem}.contactGrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:11px}.contactCard{border:1px solid var(--line);border-radius:12px;background:var(--surface);padding:16px;box-shadow:var(--shadow)}.avatar{width:34px;height:34px;display:grid;place-items:center;border-radius:10px;background:var(--surface3);color:var(--accent-strong);font-size:.58rem;font-weight:850}.contactCard h3{margin:11px 0 3px;font-size:.7rem}.contactCard p{margin:0;color:var(--muted);font-size:.54rem}.contactCard small{display:block;margin-top:8px;color:var(--muted2);font-size:.5rem;line-height:1.45}.statusDot{display:inline-block;width:6px;height:6px;margin-inline-end:6px;border-radius:50%;background:var(--accent)}.contactActions{margin-top:12px}.contactActions button{width:100%;border:1px solid var(--line);border-radius:8px;background:var(--surface2);color:var(--text);padding:7px 9px;font-size:.52rem;text-align:start}.quoteRow,.tenderRow,.taskRow,.mailRow,.docRow{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(110px,.8fr) minmax(100px,.75fr) minmax(100px,.8fr) auto;gap:10px;align-items:center;padding:12px 0;border-bottom:1px solid var(--line2)}.quoteRow:last-child,.tenderRow:last-child,.taskRow:last-child,.mailRow:last-child,.docRow:last-child{border-bottom:0}.quoteRow:hover,.tenderRow:hover,.taskRow:hover,.mailRow:hover,.docRow:hover{background:color-mix(in srgb,var(--surface2) 55%,transparent)}\n@media(max-width:900px){.accountGrid,.contactGrid{grid-template-columns:1fr}.quoteRow,.tenderRow,.taskRow,.mailRow,.docRow{grid-template-columns:1fr;gap:5px;padding:12px 0}.accountMeta{grid-template-columns:1fr}}\n`;
}

if (!css.includes(interactionMarker)) {
  css += `\n${interactionMarker}\n.simulationCard{margin:0 0 14px;padding:15px 16px;border:1px solid var(--line);border-radius:12px;background:var(--surface);box-shadow:var(--shadow)}.simulationHead{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.simulationHead small{display:block;color:var(--muted2);font-size:.5rem;text-transform:uppercase;letter-spacing:.08em}.simulationHead h3{margin:4px 0 0;font-size:.76rem}.gateState{display:inline-flex;align-items:center;border:1px solid rgba(53,199,193,.3);background:rgba(53,199,193,.09);color:#9be5e0;border-radius:999px;padding:5px 8px;font-size:.52rem;font-weight:800;white-space:nowrap}.simulationMeta{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px;margin-top:13px}.simulationMeta div{padding:9px;border-radius:8px;background:var(--surface2)}.simulationMeta span{display:block;color:var(--muted2);font-size:.48rem}.simulationMeta strong{display:block;margin-top:4px;color:var(--text);font-size:.56rem}.simulationNote{margin:11px 0 0;color:var(--muted);font-size:.55rem;line-height:1.55}.page[data-theme=dark] .simulationCard{background:var(--surface);border-color:var(--line)}\n@media(max-width:900px){.simulationMeta{grid-template-columns:1fr 1fr}}@media(max-width:560px){.simulationHead{display:block}.gateState{margin-top:8px}.simulationMeta{grid-template-columns:1fr}}\n`;
}

fs.writeFileSync(cssPath, css, "utf8");

let client = fs.readFileSync(clientPath, "utf8");

if (!client.includes("const workflowSteps: Array<{ view: View")) {
  client = client.replace(
    '  const [taskDone, setTaskDone] = useState<Record<number, boolean>>({});',
    '  const [taskDone, setTaskDone] = useState<Record<number, boolean>>({});\n  const [simulationVisible, setSimulationVisible] = useState(false);\n  const [aiMode, setAiMode] = useState<"brief" | "priorities" | "risk" | "forecast">("brief");',
  );

  client = client.replace(
    /(  const aiBrief = .*?;\n)/,
    `$1  const aiAnswer = aiMode === "priorities"\n    ? (lang === "ar" ? \`الأولوية الأولى هي \${L(opportunities[0]?.title)} بقيمة \${money(opportunities[0]?.value ?? 0)}، ثم إغلاق المراجعة الفنية والمتابعات المستحقة قبل الانتقال للفرص التالية.\` : \`First priority: \${L(opportunities[0]?.title)} at \${money(opportunities[0]?.value ?? 0)}, then close technical-review and follow-up actions before moving to the next opportunities.\`)\n    : aiMode === "risk"\n      ? (lang === "ar" ? \`أكبر تعرض طويل الدورة هو \${L(opportunities[3]?.title ?? opportunities[0]?.title)} بقيمة \${money(opportunities[3]?.value ?? opportunities[0]?.value ?? 0)}. كما أن \${L(opportunities[1]?.title)} يحتاج إغلاق المراجعة الفنية قبل تقدم العرض التجاري.\` : \`Largest long-cycle exposure: \${L(opportunities[3]?.title ?? opportunities[0]?.title)} at \${money(opportunities[3]?.value ?? opportunities[0]?.value ?? 0)}. \${L(opportunities[1]?.title)} also needs technical review closed before the commercial quote advances.\`)\n      : aiMode === "forecast"\n        ? (lang === "ar" ? \`المسار التوضيحي الحالي يبلغ \${money(metrics.openValue)} عبر \${num(opportunities.length)} فرص. التركيز على الفرص عالية التوافق وإغلاق نقاط التعطيل الفنية هو أسرع طريق لتحسين التحويل.\` : \`Current illustrative pipeline is \${money(metrics.openValue)} across \${num(opportunities.length)} opportunities. Converting the high-fit opportunities and clearing technical bottlenecks is the fastest path to improve conversion.\`)\n        : aiBrief;\n\n  const workflowSteps: Array<{ view: View; icon: string; en: string; ar: string }> = [\n    { view: "opportunities", icon: "＋", en: "Enquiry", ar: "استفسار" },\n    { view: "automation", icon: "↯", en: "Division / region routing", ar: "توجيه القسم / المنطقة" },\n    { view: "opportunities", icon: "✓", en: "Technical review", ar: "المراجعة الفنية" },\n    { view: "quotes", icon: "▤", en: "Quote", ar: "عرض السعر" },\n    { view: "email", icon: "✉", en: "Follow-up", ar: "المتابعة" },\n    { view: "tenders", icon: "◇", en: "Tender / project", ar: "المنافسة / المشروع" },\n    { view: "reports", icon: "▥", en: "Management", ar: "الإدارة" },\n  ];\n`,
  );

  client = client.replace(
    '<button className={styles.primary} onClick={() => notify(t.simulated)}>{t.simulate}</button>',
    '<button className={styles.primary} onClick={() => { setSimulationVisible(true); setActive("overview"); notify(t.simulated); }}>{t.simulate}</button>',
  );

  const workflowBlock = `          <div className={styles.flowRail}>{workflowSteps.map((step, i) => <div className={styles.flowStepWrap} key={\`workflow-\${i}\`}><button className={styles.flowStep} onClick={() => setActive(step.view)}><i>{step.icon}</i><strong>{lang === "ar" ? step.ar : step.en}</strong></button>{i < workflowSteps.length - 1 ? <span className={styles.flowArrow}>{lang === "ar" ? "←" : "→"}</span> : null}</div>)}</div>\n          {simulationVisible ? <article className={styles.simulationCard}><div className={styles.simulationHead}><div><small>{lang === "ar" ? "نتيجة محاكاة الاستفسار" : "SIMULATED ENQUIRY RESULT"}</small><h3>{L(opportunities[0]?.title) || (lang === "ar" ? "استفسار مختبري جديد" : "New laboratory enquiry")}</h3></div><span className={styles.gateState}>{lang === "ar" ? "المراجعة الفنية مطلوبة" : "TECHNICAL REVIEW REQUIRED"}</span></div><div className={styles.simulationMeta}><div><span>{lang === "ar" ? "القسم" : "Division"}</span><strong>{L(opportunities[0]?.division) || "Life Sciences"}</strong></div><div><span>{lang === "ar" ? "المنطقة" : "Region"}</span><strong>{L(accounts[0]?.region) || "Riyadh"}</strong></div><div><span>{lang === "ar" ? "المالك" : "Owner"}</span><strong>{L(accounts[0]?.owner) || (lang === "ar" ? "فريق المبيعات" : "Sales team")}</strong></div><div><span>{lang === "ar" ? "درجة التوافق" : "AI fit"}</span><strong>{num(opportunities[0]?.score ?? 94)}/100</strong></div></div><p className={styles.simulationNote}>{lang === "ar" ? "تم تصنيف الاستفسار وتوجيهه تلقائياً. يبقى عرض السعر محجوباً حتى يراجع المختص الفني المتطلبات ثم يسمح للفريق التجاري بالمتابعة." : "The enquiry has been classified and routed automatically. The quotation remains gated until the application specialist reviews the technical requirements and releases it for commercial follow-up."}</p></article> : null}\n`;

  client = client.replace(
    '          <section className={styles.metricGrid}>',
    `${workflowBlock}          <section className={styles.metricGrid}>`,
  );

  client = client.replaceAll('<p>{aiBrief}</p>', '<p>{aiAnswer}</p>');
  client = client.replaceAll('<button onClick={() => notify(t.generated)}>{t.priorities}</button>', '<button onClick={() => setAiMode("priorities")}>{t.priorities}</button>');
  client = client.replaceAll('<button onClick={() => notify(t.generated)}>{t.risk}</button>', '<button onClick={() => setAiMode("risk")}>{t.risk}</button>');
  client = client.replaceAll('<button onClick={() => notify(t.generated)}>{t.forecast}</button>', '<button onClick={() => setAiMode("forecast")}>{t.forecast}</button>');
}

fs.writeFileSync(clientPath, client, "utf8");
console.log("Systems client demo support styles and interactive workflow prepared.");
