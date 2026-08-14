import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.resolve(here, "../app/systems/demos/medical-masar/page.tsx");
const targetDir = path.resolve(here, "../app/systems/demos/national-scientific-company");
const targetPath = path.join(targetDir, "page.tsx");
const layoutPath = path.join(targetDir, "layout.tsx");

let source = fs.readFileSync(sourcePath, "utf8");

// NSC intentionally uses the exact Medical Masar operating-system structure.
// Only company identity and illustrative business examples are changed.
source = source.replace('import styles from "./v2.module.css";', 'import styles from "../medical-masar/v2.module.css";');

const replacements = [
  ["Private concept · Medical Masar", "Private concept · National Scientific Company"],
  ["تصور خاص · مسار الشفاء الطبية", "تصور خاص · الشركة الوطنية العلمية"],
  ["Medical Masar · operating system concept", "National Scientific Company · operating system concept"],
  ["مسار الشفاء الطبية · نظام تشغيلي توضيحي", "الشركة الوطنية العلمية · نظام تشغيلي توضيحي"],
  ["Medical%20Masar%20Systems%20concept", "National%20Scientific%20Company%20Systems%20concept"],
  ["Laboratory distributor operating system", "Scientific laboratory solutions operating system"],
  ["نظام تشغيل مخصص لموزع مختبرات", "نظام تشغيل مخصص لحلول ومشاريع المختبرات العلمية"],
  ["Built around tenders, fulfilment and collections", "Built around tenders, supply and collections"],
  ["مصمم حول المناقصات والتوريد والتحصيل", "مصمم حول المناقصات والتوريد والتحصيل"],
  ["Names and values are illustrative. The concept unifies the operating workflow and can connect with Odoo or Zoho rather than replacing them.", "Names and values are illustrative. The concept unifies tenders, quotations, orders, warehouse, supply, invoicing and collection across divisions and regions."],
  ["الأسماء والقيم توضيحية. الفكرة هي توحيد رحلة العمل وربطها مع Odoo أو Zoho بدل استبدالها.", "الأسماء والقيم توضيحية. الفكرة هي توحيد المناقصات وعروض الأسعار والطلبات والمستودع والتوريد والفواتير والتحصيل عبر الأقسام والمناطق."],

  ["Specialist Hospital Lab", "National Research Institute"],
  ["مختبر مستشفى تخصصي", "معهد أبحاث وطني"],
  ["Regional Diagnostic Center", "Petrochemical Quality Laboratory"],
  ["مركز تشخيص إقليمي", "مختبر جودة للبتروكيماويات"],
  ["University Research Lab", "University Central Laboratory"],
  ["مختبر أبحاث جامعي", "المختبر المركزي بالجامعة"],
  ["Forensic Sciences Unit", "New Hospital Laboratory Project"],
  ["وحدة علوم الأدلة الجنائية", "مشروع مختبر مستشفى جديد"],
  ["Hospital laboratory", "Research institute"],
  ["مختبر مستشفى", "جهة بحثية"],
  ["Diagnostic laboratory", "Industrial quality laboratory"],
  ["مختبر تشخيصي", "مختبر جودة صناعي"],
  ["Academic research", "Academic central laboratory"],
  ["بحث أكاديمي", "مختبر أكاديمي مركزي"],
  ["Government laboratory", "Turnkey laboratory project"],
  ["مختبر حكومي", "مشروع مختبر متكامل"],

  ["IHC reagents & detection systems", "Flow cytometry & molecular workflow"],
  ["كواشف وأنظمة كشف IHC", "قياس التدفق الخلوي والتحاليل الجزيئية"],
  ["Hematology analyzer framework", "Advanced spectroscopy framework"],
  ["إطار توريد جهاز أمراض الدم", "إطار توريد أنظمة تحليل طيفي متقدمة"],
  ["Forensic toxicology consumables", "Turnkey laboratory equipment package"],
  ["مستهلكات السموم الجنائية", "حزمة تجهيزات مختبر متكاملة"],

  ["RGT-IHC-112", "FCM-KIT-112"],
  ["IHC Detection Kit", "Flow Cytometry Reagent Kit"],
  ["طقم كشف IHC", "طقم كواشف قياس التدفق الخلوي"],
  ["BUF-ANT-204", "MOL-BUF-204"],
  ["Antigen Retrieval Buffer", "Molecular Assay Buffer"],
  ["محلول استرجاع المستضد", "محلول فحوص جزيئية"],
  ["AB-PDL1-37", "FCM-AB-037"],
  ["PD-L1 Primary Antibody", "Flow Cytometry Antibody Panel"],
  ["جسم مضاد أولي PD-L1", "لوحة أجسام مضادة لقياس التدفق الخلوي"],
  ["SLD-CHR-082", "CON-TUB-082"],
  ["Charged Slides", "Sample Tubes & Consumables"],
  ["شرائح مشحونة", "أنابيب عينات ومستهلكات"],
  ["RGT-DAB-051", "RGT-SHF-051"],
  ["DAB Chromogen", "Sheath Fluid Reagent"],
  ["كروموجين DAB", "كاشف سائل الغمد"],
  ["CTR-IHC-008", "FCM-CTR-008"],
  ["IHC Positive Control", "Flow Cytometry Control"],
  ["ضابط موجب IHC", "ضابط قياس التدفق الخلوي"],
  ["The IHC order", "The flow-cytometry order"],
  ["the IHC order", "the flow-cytometry order"],
  ["طلب IHC", "طلب قياس التدفق الخلوي"],
  ["one PD-L1 antibody and two DAB Chromogen units", "one antibody-panel unit and two sheath-fluid units"],
  ["جسم مضاد PD-L1 واحد ووحدتان من DAB Chromogen", "وحدة واحدة من لوحة الأجسام المضادة ووحدتان من كاشف سائل الغمد"],
];

for (const [from, to] of replacements) source = source.replaceAll(from, to);

// Make the management/AI narrative read naturally for NSC's multi-division scientific-distribution context.
source = source
  .replaceAll("Laboratory distributor", "Scientific laboratory distributor")
  .replaceAll("laboratory distributor", "scientific laboratory distributor")
  .replaceAll("موزع مختبرات", "موزع حلول مختبرية وعلمية");

fs.mkdirSync(targetDir, { recursive: true });
fs.writeFileSync(targetPath, source, "utf8");

const layout = `import type { Metadata } from "next";\nimport "../medical-masar/flat-dark.css";\n\nexport const metadata: Metadata = {\n  title: "Private Concept — National Scientific Company | LabNarrative Systems",\n  description: "A private illustrative LabNarrative Systems concept connecting tenders, quotations, orders, warehouse, supply, invoicing, collections, and management visibility for National Scientific Company.",\n  robots: { index: false, follow: false, nocache: true },\n};\n\nexport default function NationalScientificCompanyConceptLayout({ children }: Readonly<{ children: React.ReactNode }>) {\n  return <>{children}</>;\n}\n`;
fs.writeFileSync(layoutPath, layout, "utf8");

console.log("NSC demo generated from the Medical Masar tender-to-collection operating workflow.");
