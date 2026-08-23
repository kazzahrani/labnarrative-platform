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
    description: "نبدأ بها كأقوى مرشح للربط المباشر للحسابات والأسهم والصناديق والنقد.",
    methods: ["OAuth / API", "قراءة فقط"],
  },
  {
    name: "Interactive Brokers",
    category: "وسيط عالمي",
    status: "ربط مباشر",
    description: "للأسهم العالمية وETFs والنقد متعدد العملات ضمن نفس صورة الثروة.",
    methods: ["API", "قراءة فقط"],
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
    status: "رفع كشف",
    description: "ابدأ من محفظتك الحالية في عوائد: أسهم وصناديق ومرابحات ضمن مصدر واحد، مع مسار مخصص للاستيراد والمراجعة.",
    methods: ["كشف / ملف", "إدخال يدوي", "ربط رسمي لاحقًا"],
    href: "/wealth/connect/awaed",
  },
  {
    name: "الراجحي المالية",
    category: "وسيط سعودي",
    status: "رفع كشف",
    description: "ارفع كشف PDF أو Excel لإضافة المحفظة الآن، ثم نحدّث قيم الأصول عبر بيانات السوق.",
    methods: ["PDF", "Excel", "CSV"],
  },
  {
    name: "SNB Capital",
    category: "وسيط سعودي",
    status: "رفع كشف",
    description: "إضافة عملية للمحفظة السعودية دون انتظار تكامل API رسمي.",
    methods: ["PDF", "Excel", "CSV"],
  },
  {
    name: "الرياض المالية",
    category: "وسيط سعودي",
    status: "رفع كشف",
    description: "نبدأ بالكشف، ثم نستبدله لاحقًا بربط مباشر عند توفر التكامل المناسب.",
    methods: ["PDF", "Excel", "CSV"],
  },
  {
    name: "الإنماء للاستثمار",
    category: "وسيط سعودي",
    status: "رفع كشف",
    description: "أدخل الأسهم والصناديق المحلية من كشف الحساب بطريقة سريعة وواضحة.",
    methods: ["PDF", "Excel", "CSV"],
  },
  {
    name: "Sahm",
    category: "وسيط استثماري",
    status: "رفع كشف",
    description: "أضف محفظتك الحالية إلى صورة الثروة الموحدة حتى قبل توفر الربط المباشر.",
    methods: ["PDF", "CSV"],
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
              <Link href={card.href} className={`${styles.chooseButton} ${card.featured ? styles.featuredButton : ""}`}>{card.name === "Binance" ? "ربط Binance" : "فتح"}</Link>
            ) : (
              <button type="button" className={styles.chooseButton}>اختيار</button>
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
            <p>نبدأ الآن بالروابط الفعلية الآمنة، ونستخدم الكشوف أو الإدخال اليدوي فقط عندما لا يتوفر API مناسب.</p>
            <div className={styles.heroActions}><a href="#sources" className={styles.primary}>الحسابات والمصادر</a><Link href="/wealth/accounts" className={styles.secondary}>الحسابات</Link></div>
          </section>
        </header>

        <section className={styles.flow}>
          <div className={styles.flowIntro}><span className={styles.eyebrow}>الأساس</span><h2>ربط، مزامنة، ثم تحقق.</h2><p>كل اتصال يدخل عبر محرك واحد مع سجل مزامنة وفصل كامل بين الحسابات.</p></div>
          <div className={styles.steps}>
            <article><span>٠١</span><h3>اربط المصدر</h3><p>بصلاحيات القراءة فقط عندما يكون الربط المباشر متاحًا.</p></article>
            <article><span>٠٢</span><h3>زامن البيانات</h3><p>الحساب والأرصدة والأسعار تدخل إلى نفس نموذج البيانات.</p></article>
            <article><span>٠٣</span><h3>راجع النتيجة</h3><p>أي خطأ أو أصل غير مسعّر يظهر في سجل المزامنة بدل إخفائه.</p></article>
          </div>
        </section>

        <div id="sources" className={styles.sections}>
          <SourceSection eyebrow="ربط مباشر" title="الروابط الفعلية" description="Binance يعمل الآن؛ بقية الروابط سنفعلها على نفس المحرك بعد ثباته." cards={directSources} />
          <SourceSection eyebrow="رفع كشف" title="مصادر بدون ربط مباشر حتى الآن" description="نستخدم الكشف أو الإدخال اليدوي فقط كحل مرحلي." cards={importSources} />
          <SourceSection eyebrow="إدخال يدوي" title="الأصول التي لا تحتاج API" description="للعقار والذهب والسيولة والأصول الخاصة." cards={manualSources} />
        </div>
      </div>
    </main>
  );
}
