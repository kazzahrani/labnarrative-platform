import Link from "next/link";
import ManualAwaedClientV3 from "./ManualAwaedClientV3";
import styles from "./awaed.module.css";

export const metadata = {
  title: "تحديث محفظة عوائد — ثروة",
  description: "طابق محفظة عوائد الحالية بأمان مع ثروة دون استبدال البيانات عشوائيًا.",
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
            <span className={styles.eyebrow}>المحفظة الحقيقية</span>
            <h1>حدّث محفظة عوائد، ولا تعِد إدخالها.</h1>
            <p>
              ثروة تحمّل الأصول المسجلة حاليًا ثم تطابقها مع أي تغيير تقوم به. عدّل الكمية أو متوسط التكلفة عند الشراء أو البيع،
              بينما أسعار الأسهم والـREIT السعودية تستمر في التحديث تلقائيًا.
            </p>
          </div>
          <div className={styles.heroFacts}>
            <div><span>الأصول الحالية</span><strong>تُحمّل تلقائيًا</strong></div>
            <div><span>الأسهم والـREIT</span><strong>سعر سوق تلقائي</strong></div>
            <div><span>تغير الكمية</span><strong>يُسجل في التاريخ</strong></div>
            <div><span>طريقة الحفظ</span><strong>مطابقة ذرّية</strong></div>
          </div>
        </section>

        <ManualAwaedClientV3 />

        <section className={styles.securityNote}>
          <span>بدون بيانات دخول عوائد</span>
          <p>
            لا نطلب اسم المستخدم أو كلمة المرور، ولا ننفذ تداولًا. تحديث الكمية هنا يعني فقط أن ثروة تطابق سجلها مع لقطة محفظتك الحالية،
            وتتعامل مع الفرق كتعديل مركز ما لم يتوفر لنا لاحقًا سجل تنفيذ رسمي من عوائد.
          </p>
        </section>
      </div>
    </main>
  );
}
