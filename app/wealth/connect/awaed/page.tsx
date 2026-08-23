import Link from "next/link";
import AwaedScreenshotClient from "./AwaedScreenshotClient";
import AwaedImportClient from "./AwaedImportClient";
import styles from "./awaed.module.css";

export const metadata = {
  title: "إضافة محفظة عوائد — ثروة",
  description: "أضف استثمارات عوائد إلى لوحة ثروتك عبر صور المحفظة أو كشف الحساب أو الإدخال السريع.",
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
              أسهل طريقة الآن هي تصوير صفحة استثماراتك في عوائد ورفع اللقطات. تقرأها ثروة محليًا،
              تعرض الأصول للمراجعة، ثم تحفظ فقط البيانات التي تعتمدها أنت.
            </p>
          </div>
          <div className={styles.heroFacts}>
            <div><span>صور المحفظة</span><strong>مدعومة</strong></div>
            <div><span>الأسهم والصناديق</span><strong>مدعومة</strong></div>
            <div><span>المرابحات</span><strong>مدعومة</strong></div>
            <div><span>الوضع الحالي</span><strong>قراءة فقط</strong></div>
          </div>
        </section>

        <AwaedScreenshotClient />
        <AwaedImportClient />

        <section className={styles.securityNote}>
          <span>الخصوصية أولًا</span>
          <p>
            لا نطلب اسم المستخدم أو كلمة مرور عوائد، ولا ننفذ أي تداول أو تحويل. صور المحفظة تُقرأ داخل متصفحك
            ولا نخزن الصور نفسها في قاعدة البيانات؛ بعد المراجعة نحفظ فقط بيانات الأصول التي وافقت عليها،
            داخل جداول ثروة المحمية بسياسات وصول لكل مستخدم.
          </p>
        </section>
      </div>
    </main>
  );
}
