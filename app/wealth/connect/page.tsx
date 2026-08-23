import Link from "next/link";
import styles from "./connect.module.css";

type SourceCard = {
  name: string;
  category: string;
  status: "ربط مباشر" | "رفع كشف" | "إدخال يدوي";
  description: string;
  methods: string[];
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
    description: "عرض وتحليل الأصول الرقمية فقط داخل منصة الثروة، دون تداول أو سحب.",
    methods: ["API قراءة فقط", "CSV"],
  },
];

const importSources: SourceCard[] = [
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

function SourceSection({
  eyebrow,
  title,
  description,
  cards,
}: {
  eyebrow: string;
  title: string;
  description: string;
  cards: SourceCard[];
}) {
  return (
    <section className={styles.sourceSection}>
      <div className={styles.sectionIntro}>
        <span>{eyebrow}</span>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <div className={styles.sourceGrid}>
        {cards.map((card) => (
          <article className={styles.sourceCard} key={card.name}>
            <div className={styles.sourceTop}>
              <div>
                <small>{card.category}</small>
                <h3>{card.name}</h3>
              </div>
              <span className={styles.status}>{card.status}</span>
            </div>
            <p>{card.description}</p>
            <div className={styles.methods}>
              {card.methods.map((method) => <span key={method}>{method}</span>)}
            </div>
            <button type="button" className={styles.chooseButton}>اختيار</button>
          </article>
        ))}
      </div>
    </section>
  );
}

export const metadata = {
  title: "إضافة أصل أو حساب — ثروة",
  description: "أضف حساباتك وأصولك إلى لوحة الثروة السعودية عبر الربط المباشر أو رفع كشف أو الإدخال اليدوي.",
};

export default function WealthConnectPage() {
  return (
    <main className={styles.page} dir="rtl">
      <div className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.headerLine}>
            <Link href="/wealth" className={styles.back}>العودة إلى لوحة الثروة</Link>
            <span className={styles.pill}>إضافة أصل أو حساب</span>
          </div>

          <section className={styles.hero}>
            <span className={styles.eyebrow}>ثروة</span>
            <h1>أضف أصولك وحساباتك بطريقة بسيطة جدًا.</h1>
            <p>
              اختر المصدر، ثم استخدم أفضل طريقة متاحة: ربط مباشر، رفع كشف، أو إدخال يدوي.
              الهدف أن تكتمل صورة ثروتك في مكان واحد دون تعقيد.
            </p>
            <div className={styles.heroActions}>
              <a href="#sources" className={styles.primary}>ابدأ الإضافة</a>
              <Link href="/wealth" className={styles.secondary}>رجوع إلى المنصة</Link>
            </div>
          </section>
        </header>

        <section className={styles.flow}>
          <div className={styles.flowIntro}>
            <span className={styles.eyebrow}>كيف تعمل التجربة</span>
            <h2>ثلاث خطوات فقط.</h2>
            <p>المنصة عملية من اليوم الأول حتى قبل اكتمال كل التكاملات الرسمية مع الجهات.</p>
          </div>
          <div className={styles.steps}>
            <article><span>٠١</span><h3>اختر المصدر</h3><p>وسيط، صندوق، صك، عقار، نقد، كريبتو أو أصل خاص.</p></article>
            <article><span>٠٢</span><h3>اختر طريقة الإضافة</h3><p>ربط مباشر حيث يتوفر، أو كشف حساب، أو إدخال يدوي.</p></article>
            <article><span>٠٣</span><h3>راجع وأضف</h3><p>ستدخل الأصول إلى صافي الثروة والتوزيع والدخل والتحليلات.</p></article>
          </div>
        </section>

        <div id="sources" className={styles.sections}>
          <SourceSection
            eyebrow="ربط مباشر"
            title="الحسابات التي نبدأ بها أولًا"
            description="مصادر مناسبة للربط المباشر أو القراءة الآلية في المراحل الأولى."
            cards={directSources}
          />
          <SourceSection
            eyebrow="رفع كشف"
            title="أضف محافظك السعودية الحالية الآن"
            description="لا ننتظر كل APIs الرسمية. الكشف يسمح لنا بإدخال المحفظة ثم متابعة قيمتها."
            cards={importSources}
          />
          <SourceSection
            eyebrow="إدخال يدوي"
            title="أكمل بقية صورة ثروتك"
            description="للأصول الخاصة أو البسيطة التي لا تحتاج اتصالًا تقنيًا مع جهة خارجية."
            cards={manualSources}
          />
        </div>

        <section className={styles.preview}>
          <div>
            <span className={styles.eyebrow}>المعاينة</span>
            <h2>كل مصدر ينتهي في لوحة واحدة.</h2>
            <p>بعد الإضافة، تظهر الأصول ضمن صافي الثروة وتوزيعها والدخل والسيولة، ثم نضيف لاحقًا طبقة الشرعية والزكاة.</p>
          </div>
          <div className={styles.previewList}>
            <div><strong>دراية</strong><span>ربط مباشر</span><b>متصل</b></div>
            <div><strong>الراجحي المالية</strong><span>كشف PDF</span><b>جاهز للمراجعة</b></div>
            <div><strong>عقار استثماري</strong><span>إدخال يدوي</span><b>مضاف</b></div>
          </div>
        </section>
      </div>
    </main>
  );
}
