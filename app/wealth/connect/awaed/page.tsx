import Link from "next/link";
import AwaedImportClient from "./AwaedImportClient";
import styles from "./awaed.module.css";

export const metadata = {
  title: "إضافة محفظة عوائد — ثروة",
  description: "أضف استثمارات عوائد إلى لوحة ثروتك عبر إدخال سريع أو رفع كشف للمراجعة.",
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
            <span className={styles.eyebrow}>محفظتك الحالية</span>
            <h1>ابدأ بمحفظة عوائد.</h1>
            <p>
              اجمع استثماراتك في عوائد داخل صورة ثروتك الكاملة. نبدأ اليوم بإدخال آمن وبسيط،
              ثم نستبدله لاحقًا بربط مباشر رسمي عندما يتوفر التكامل المناسب.
            </p>
          </div>
          <div className={styles.heroFacts}>
            <div><span>الأسهم</span><strong>مدعومة</strong></div>
            <div><span>الصناديق</span><strong>مدعومة</strong></div>
            <div><span>المرابحات</span><strong>مدعومة</strong></div>
            <div><span>الوضع الحالي</span><strong>قراءة فقط</strong></div>
          </div>
        </section>

        <AwaedImportClient />

        <section className={styles.securityNote}>
          <span>الخصوصية أولًا</span>
          <p>
            هذه النسخة لا تطلب اسم المستخدم أو كلمة مرور عوائد، ولا تنفذ أي تداول أو تحويل.
            الحفظ المؤقت في هذه المرحلة يتم داخل متصفحك فقط إلى أن ننشئ طبقة التخزين المالية المنفصلة.
          </p>
        </section>
      </div>
    </main>
  );
}
