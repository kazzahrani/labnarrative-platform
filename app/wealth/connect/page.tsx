import Link from "next/link";
import styles from "./connect.module.css";

type SourceCard = {
  name: string;
  category: string;
  status: "ربط مباشر" | "رفع كشف" | "إدخال يدوي";
  description: string;
  methods: string[];
  href?: string;
  featured?: boolean;
};

const directSources: SourceCard[] = [
  {
    name: "دراية",
    category: "وسيط سعودي",
    status: "ربط مباشر",
    description: "OpenAPI رسمي يدعم OAuth والمحفظة والنقد والنشاط. ننتظر بيانات Sandbox/Production من دراية قبل تفعيل الربط الحقيقي.",
    methods: ["OAuth 2.0", "API رسمي", "يتطلب اعتماد شريك"],
  },
  {
    name: "Interactive Brokers",
    category: "وسيط عالمي",
    status: "ربط مباشر",
    description: "ربط فعلي عبر Flex Web Service للمراكز والتكلفة والنقد والحركات، بدون كلمة مرور أو صلاحية تداول.",
    methods: ["Flex Web Service", "تقارير فقط", "Vault مشفر"],
    href: "/wealth/connect/ibkr",
    featured: true,
  },
  {
    name: "Binance",
    category: "أصول رقمية",
    status: "ربط مباشر",
    description: "ربط فعلي لأرصدة Spot بصلاحية قراءة فقط، دون تداول أو سحب أو تحويل.",
    methods: ["API قراءة فقط", "Vault مشفر"],
    href: "/wealth/connect/binance",
    featured: true,
  },
];

const importSources: SourceCard[] = [
  {
    name: "عوائد",
    category: "منصة استثمار سعودية",
    status: "إدخال يدوي",
    description: "المسار الحالي الموثوق لعوائد هو الإدخال اليدوي المفصل إلى أن يتوفر ربط رسمي.",
    methods: ["إدخال يدوي", "ربط رسمي لاحقًا"],
    href: "/wealth/connect/awaed",
  },
  {
    name: "دراية · كشف",
    category: "وسيط سعودي",
    status: "رفع كشف",
    description: "استخدم CSV أو Excel الآن كحل فعلي مؤقت إلى أن نستلم بيانات OpenAPI الرسمية.",
    methods: ["Excel", "CSV", "مراجعة قبل الحفظ"],
    href: "/wealth/connect/statement?provider=derayah",
  },
  {
    name: "الراجحي المالية",
    category: "وسيط سعودي",
    status: "رفع كشف",
    description: "استورد CSV أو Excel واربط الأعمدة بنفسك قبل إدخال أي مركز إلى ثروة.",
    methods: ["Excel", "CSV", "مراجعة قبل الحفظ"],
    href: "/wealth/connect/statement?provider=alrajhi",
  },
  {
    name: "SNB Capital",
    category: "وسيط سعودي",
    status: "رفع كشف",
    description: "استيراد فعلي للكشف دون انتظار API، مع معاينة كاملة للمراكز والتكلفة.",
    methods: ["Excel", "CSV", "مراجعة قبل الحفظ"],
    href: "/wealth/connect/statement?provider=snb",
  },
  {
    name: "الرياض المالية",
    category: "وسيط سعودي",
    status: "رفع كشف",
    description: "استورد الكشف الآن، ثم يمكن استبداله لاحقًا بربط مباشر عندما يتوفر رسميًا.",
    methods: ["Excel", "CSV", "مراجعة قبل الحفظ"],
    href: "/wealth/connect/statement?provider=riyad",
  },
  {
    name: "الإنماء للاستثمار",
    category: "وسيط سعودي",
    status: "رفع كشف",
    description: "إدخال الأسهم والصناديق من ملف منظم مع ربط مرن للأعمدة.",
    methods: ["Excel", "CSV", "مراجعة قبل الحفظ"],
    href: "/wealth/connect/statement?provider=alinma",
  },
  {
    name: "Sahm",
    category: "وسيط استثماري",
    status: "رفع كشف",
    description: "استورد محفظة Sahm من CSV أو Excel إلى صورة الثروة الموحدة.",
    methods: ["Excel", "CSV", "مراجعة قبل الحفظ"],
    href: "/wealth/connect/statement?provider=sahm",
  },
];

const manualSources: SourceCard[] = [
  {
    name: "أسهم سعودية",
    category: "أصل مدرج",
    status: "إدخال يدوي",
    description: "أدخل الرمز والكمية ومتوسط التكلفة، ثم تتولى المنصة متابعة القيمة.",
    methods: ["رمز", "كمية", "تكلفة"],
  },
  {
    name: "صندوق استثماري",
    category: "صناديق",
    status: "إدخال يدوي",
    description: "أضف اسم الصندوق وعدد الوحدات والقيمة أو سعر الوحدة.",
    methods: ["اسم الصندوق", "وحدات"],
  },
  {
    name: "صكوك",
    category: "دخل ثابت",
    status: "إدخال يدوي",
    description: "تابع القيمة والاستحقاق والدخل المتوقع ضمن بقية ثروتك.",
    methods: ["قيمة", "استحقاق", "دخل"],
  },
  {
    name: "عقار",
    category: "أصل حقيقي",
    status: "إدخال يدوي",
    description: "للأراضي والفلل والشقق والعقار الاستثماري مع الدخل السنوي إن وجد.",
    methods: ["قيمة تقديرية", "دخل سنوي"],
  },
  {
    name: "ذهب",
    category: "أصل بديل",
    status: "إدخال يدوي",
    description: "سجّل الوزن أو القيمة الإجمالية ليظهر ضمن صافي الثروة.",
    methods: ["وزن", "قيمة"],
  },
  {
    name: "نقد أو حساب بنكي",
    category: "سيولة",
    status: "إدخال يدوي",
    description: "أضف الأرصدة النقدية بالريال أو العملات الأخرى.",
    methods: ["رصيد", "عملة"],
  },
  {
    name: "استثمار خاص",
    category: "أصل خاص",
    status: "إدخال يدوي",
    description: "للشركات الخاصة والاستثمارات غير المدرجة وأي أصل لا يتوفر له سعر سوق مباشر.",
    methods: ["اسم", "قيمة", "ملاحظات"],
  },
];

function SourceSection({ eyebrow, title, description, cards }: { eyebrow: string; title: string; description: string; cards: SourceCard[] }) {
  return (
    <section className={styles.sourceSection}>
      <div className={styles.sectionIntro}>
        <span>{eyebrow}</span>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <div className={styles.sourceGrid}>
        {cards.map((card) => (
          <article className={`${styles.sourceCard} ${card.featured ? styles.featuredCard : ""}`} key={card.name}>
            <div className={styles.sourceTop}>
              <div><small>{card.category}</small><h3>{card.name}</h3></div>
              <span className={styles.status}>{card.status}</span>
            </div>
            <p>{card.description}</p>
            <div className={styles.methods}>{card.methods.map((method) => <span key={method}>{method}</span>)}</div>
            {card.href ? (
              <Link href={card.href} className={`${styles.chooseButton} ${card.featured ? styles.featuredButton : ""}`}>
                {card.status === "رفع كشف" ? "استيراد الكشف" : card.status === "إدخال يدوي" ? "فتح" : `ربط ${card.name}`}
              </Link>
            ) : (
              <button type="button" className={styles.chooseButton} disabled>يتطلب اعتماد المزود</button>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

export const metadata = {
  title: "إدارة الأصول والحسابات — ثروة",
  description: "أضف أو اربط حساباتك وأصولك في ثروة.",
};

export default function WealthConnectPage() {
  return (
    <main className={styles.page} dir="rtl">
      <div className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.headerLine}>
            <Link href="/wealth" className={styles.back}>العودة إلى لوحة الثروة</Link>
            <span className={styles.pill}>إدارة الأصول</span>
          </div>
          <section className={styles.hero}>
            <span className={styles.eyebrow}>ثروة</span>
            <h1>اربط حساباتك وأكمل صورة ثروتك.</h1>
            <p>نستخدم الربط الرسمي عندما يكون متاحًا، والكشف المنظم عندما يحتاج المزود إلى شراكة أو لا يوفر API للمستخدم مباشرة.</p>
            <div className={styles.heroActions}><a href="#sources" className={styles.primary}>الحسابات والمصادر</a><Link href="/wealth/accounts" className={styles.secondary}>الحسابات</Link></div>
          </section>
        </header>

        <section className={styles.flow}>
          <div className={styles.flowIntro}><span className={styles.eyebrow}>الأساس</span><h2>ربط، مزامنة، ثم تحقق.</h2><p>كل مصدر يدخل إلى نفس نموذج الحسابات والأصول والتكلفة والنقد بدون خلط البيانات.</p></div>
          <div className={styles.steps}>
            <article><span>٠١</span><h3>اربط أو استورد</h3><p>API قراءة فقط عندما يتوفر، أو ملف منظم عندما لا يتوفر.</p></article>
            <article><span>٠٢</span><h3>راجع البيانات</h3><p>لا نحفظ كشفًا قبل معاينة الأعمدة والمراكز والتكلفة.</p></article>
            <article><span>٠٣</span><h3>وحّد المحفظة</h3><p>تدخل النتيجة إلى نفس صافي الثروة والتحليلات والمحاسبة.</p></article>
          </div>
        </section>

        <div id="sources" className={styles.sections}>
          <SourceSection eyebrow="ربط مباشر" title="الروابط الفعلية" description="Binance يعمل فعليًا. IBKR جاهز عند توفر حساب صالح. دراية تحتاج اعتماد OpenAPI من المزود." cards={directSources} />
          <SourceSection eyebrow="رفع كشف" title="الوسطاء السعوديون الآن" description="CSV وExcel يعملان الآن مع ربط مرن للأعمدة ومعاينة قبل الحفظ." cards={importSources} />
          <SourceSection eyebrow="إدخال يدوي" title="الأصول التي لا تحتاج API" description="للعقار والذهب والسيولة والأصول الخاصة." cards={manualSources} />
        </div>
      </div>
    </main>
  );
}
