import Link from "next/link";
import ManualAwaedClient from "./ManualAwaedClient";
import styles from "./awaed.module.css";

export const metadata = {
  title: "إضافة محفظة عوائد — ثروة",
  description: "أضف استثمارات عوائد يدويًا إلى لوحة ثروتك بشكل بسيط وآمن.",
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
            <h1>أدخل محفظة عوائد يدويًا.</h1>
            <p>
              بما أن تطبيق عوائد يمنع التقاط صور الشاشة، جعلنا الإدخال اليدوي هو المسار الأساسي.
              انقل اسم الاستثمار ونوعه وقيمته الحالية فقط، وأضف الكمية ومتوسط التكلفة إذا أردت تحليلات أدق لاحقًا.
            </p>
          </div>
          <div className={styles.heroFacts}>
            <div><span>الحد الأدنى المطلوب</span><strong>الاسم + القيمة</strong></div>
            <div><span>الأسهم والصناديق</span><strong>مدعومة</strong></div>
            <div><span>المرابحات والصكوك</span><strong>مدعومة</strong></div>
            <div><span>الوضع الحالي</span><strong>قراءة فقط</strong></div>
          </div>
        </section>

        <ManualAwaedClient />

        <section className={styles.securityNote}>
          <span>الخصوصية أولًا</span>
          <p>
            لا نطلب اسم المستخدم أو كلمة مرور عوائد، ولا ننفذ أي تداول أو تحويل. أنت تنقل فقط بيانات الاستثمارات التي تريد إضافتها،
            وتُحفظ بعد تسجيل الدخول داخل جداول ثروة المحمية بسياسات وصول لكل مستخدم.
          </p>
        </section>
      </div>
    </main>
  );
}
