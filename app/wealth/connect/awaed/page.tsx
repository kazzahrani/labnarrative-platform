import Link from "next/link";
import ManualAwaedClientV4 from "./ManualAwaedClientV4";
import styles from "./awaed.module.css";

export const metadata = {
  title: "تحديث محفظة عوائد — ثروة",
  description: "طابق محفظة عوائد السعودية والأمريكية بعملتها الأصلية داخل ثروة.",
};

export default function AwaedConnectPage() {
  return (
    <main className={styles.page} dir="rtl">
      <div className={styles.shell}>
        <header className={styles.headerLine}>
          <Link href="/wealth/connect" className={styles.back}>العودة إلى مصادر الاستثمار</Link>
          <span className={styles.pill}>عوائد × ثروة</span>
        </header>

        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <span className={styles.eyebrow}>السوق السعودي + الأمريكي</span>
            <h1>أدخل الاستثمار بعملته الأصلية.</h1>
            <p>
              اختر الريال للأصول السعودية والدولار للأصول الأمريكية كما تظهر في عوائد. تحتفظ ثروة بالقيمة الأصلية،
              ثم توحّد الحسابات وتعرض المنصة كلها بالعملة الرئيسية التي تختارها.
            </p>
          </div>
          <div className={styles.heroFacts}>
            <div><span>العملات المدعومة</span><strong>ر.س + $</strong></div>
            <div><span>سعر التحويل</span><strong>1$ = 3.75 ر.س</strong></div>
            <div><span>الأسهم السعودية</span><strong>سعر سوق تلقائي</strong></div>
            <div><span>الحفظ</span><strong>مطابقة ذرّية</strong></div>
          </div>
        </section>

        <ManualAwaedClientV4 />

        <section className={styles.securityNote}>
          <span>عملة الأصل لا تضيع</span>
          <p>
            ثروة تستخدم الريال كعملة محاسبية داخلية موحدة، لكنها تحفظ عملة الإدخال والقيمة الأصلية لكل أصل. تغيير العملة الرئيسية
            من ريال إلى دولار يغير العرض فقط ولا يعيد كتابة استثماراتك أو تكلفتها.
          </p>
        </section>
      </div>
    </main>
  );
}
