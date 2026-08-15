import MasterOperationsDemoClient from "../demos/[slug]/MasterOperationsDemoClient";

const B = (en: string, ar: string) => ({ en, ar });

export default function SystemsDemoPage() {
  return (
    <MasterOperationsDemoClient
      companyName="Illustrative Scientific Distributor"
      industry="Scientific, medical and laboratory distribution"
      location="Saudi Arabia / GCC"
      config={{
        shortName: B("Operations Demo", "نموذج العمليات"),
        conceptLabel: B("Public flagship demo", "النموذج العام الرئيسي"),
        tagline: B(
          "From tender to collection — without losing a single line item",
          "من المناقصة إلى التحصيل — بدون فقدان بند واحد",
        ),
        aiBrief: B(
          "Focus management attention on tender deadlines, incomplete orders, warehouse shortages and overdue collections.",
          "ركز انتباه الإدارة على مواعيد المناقصات والطلبات غير المكتملة ونواقص المستودع والتحصيلات المتأخرة.",
        ),
        reportSummary: B(
          "One operating view connects commercial execution, fulfilment and cash collection while keeping management aware of exceptions that need intervention.",
          "تجمع لوحة تشغيل واحدة التنفيذ التجاري والتوريد والتحصيل، مع إبقاء الإدارة على اطلاع بالاستثناءات التي تحتاج تدخلاً.",
        ),
        workflows: [
          {
            name: B("Tender deadline & readiness watch", "مراقبة مواعيد وجاهزية المناقصات"),
            detail: B("Escalate missing requirements before submission risk appears.", "تصعيد المتطلبات الناقصة قبل ظهور خطر التأخير في التقديم."),
            enabled: true,
          },
          {
            name: B("Quotation completeness gate", "بوابة اكتمال عرض السعر"),
            detail: B("Validate every requested line, quantity and technical requirement before send.", "التحقق من كل بند وكمية ومتطلب فني قبل الإرسال."),
            enabled: true,
          },
          {
            name: B("Order completeness before dispatch", "اكتمال الطلب قبل الشحن"),
            detail: B("Do not release an order while required lines are still missing.", "عدم السماح بخروج الطلب بينما ما زالت بنود مطلوبة ناقصة."),
            enabled: true,
          },
          {
            name: B("Warehouse shortage linked to supply", "ربط نقص المستودع بالتوريد"),
            detail: B("Connect shortages directly to affected customer orders and supplier actions.", "ربط النواقص مباشرة بطلبات العملاء وإجراءات الموردين."),
            enabled: true,
          },
          {
            name: B("Invoice & collection prioritisation", "أولوية الفواتير والتحصيل"),
            detail: B("Surface overdue balances with owners and next actions.", "إظهار المبالغ المتأخرة مع المسؤول والإجراء التالي."),
            enabled: true,
          },
        ],
      }}
    />
  );
}
