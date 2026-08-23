import styles from "./wealth.module.css";

const allocation = [
  ["الأسهم السعودية", "٩٢٠٬٠٠٠ ر.س", "٢٧٫٨٪"],
  ["الأسهم العالمية", "٧٨٠٬٠٠٠ ر.س", "٢٣٫٦٪"],
  ["العقار", "٧٤٠٬٠٠٠ ر.س", "٢٢٫٤٪"],
  ["الصناديق", "٣٦٠٬٠٠٠ ر.س", "١٠٫٩٪"],
  ["الصكوك", "٢٤٠٬٠٠٠ ر.س", "٧٫٣٪"],
  ["الأصول الرقمية", "١٦٨٬٥٠٠ ر.س", "٥٫١٪"],
  ["النقد", "٩٦٬٢٠٠ ر.س", "٢٫٩٪"],
];

const accounts = [
  ["دراية", "محفظة استثمارية", "٦٨٤٬٣٠٠ ر.س", "متصل"],
  ["الراجحي المالية", "محفظة محلية", "٥١٢٬٦٠٠ ر.س", "كشف محدث"],
  ["Interactive Brokers", "أسهم عالمية", "٧٨٠٬٠٠٠ ر.س", "متصل"],
  ["Binance", "أصول رقمية", "١٦٨٬٥٠٠ ر.س", "متصل"],
];

export const metadata = {
  title: "ثروة — لوحة الثروة السعودية",
  description: "منصة عربية بسيطة لتجميع ومتابعة الثروة والاستثمارات في مكان واحد.",
};

export default function WealthPage() {
  return (
    <main className={styles.page} dir="rtl">
      <aside className={styles.sidebar}>
        <div>
          <div className={styles.brand}>ثروة</div>
          <div className={styles.brandSub}>إدارة الثروة</div>
        </div>
        <nav className={styles.nav}>
          <div className={`${styles.navItem} ${styles.active}`}>نظرة عامة</div>
          <div className={styles.navItem}>الأصول</div>
          <div className={styles.navItem}>الدخل</div>
          <div className={styles.navItem}>التحليلات</div>
          <div className={styles.navItem}>الالتزام الشرعي</div>
          <div className={styles.navItem}>الحسابات</div>
        </nav>
        <div className={styles.profile}>
          <span className={styles.avatar}>خ</span>
          <span><strong>حساب المستثمر</strong><small>الملف والإعدادات</small></span>
        </div>
      </aside>

      <section className={styles.workspace}>
        <header className={styles.topbar}>
          <div>
            <p>الأحد، ٢٣ أغسطس</p>
            <h1>نظرة عامة</h1>
          </div>
          <div className={styles.topActions}>
            <button className={styles.ghostButton}>الإشعارات</button>
            <button className={styles.primaryButton}>إضافة أصل أو حساب</button>
          </div>
        </header>

        <div className={styles.content}>
          <section className={styles.heroGrid}>
            <article className={styles.netWorthCard}>
              <div className={styles.cardHeader}><span>صافي الثروة</span><small>محدّث الآن</small></div>
              <div className={styles.netWorth}>٣٬٣٠٧٬٧٠٠ <span>ر.س</span></div>
              <div className={styles.growth}>↑ ٢٦٤٬٨٠٠ ر.س <span>+٨٫٧٪ منذ بداية السنة</span></div>
              <div className={styles.chart} aria-label="منحنى صافي الثروة">
                <svg viewBox="0 0 800 220" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="fade" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="rgba(250,250,250,.12)" />
                      <stop offset="100%" stopColor="rgba(250,250,250,0)" />
                    </linearGradient>
                  </defs>
                  <path d="M0 175 C70 168,90 150,145 158 S230 129,285 138 S350 110,415 116 S500 84,560 94 S640 62,705 72 S755 43,800 48 L800 220 L0 220 Z" fill="url(#fade)" />
                  <path d="M0 175 C70 168,90 150,145 158 S230 129,285 138 S350 110,415 116 S500 84,560 94 S640 62,705 72 S755 43,800 48" fill="none" stroke="rgba(250,250,250,.9)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                </svg>
              </div>
              <div className={styles.ranges}><span>شهر</span><span>٣ أشهر</span><span>٦ أشهر</span><span className={styles.selectedRange}>سنة</span><span>الكل</span></div>
            </article>

            <div className={styles.metricStack}>
              <article className={styles.metric}><p>العائد السنوي</p><strong>+٨٫٧٪</strong><small>أعلى من العام الماضي بـ ٢٫١٪</small></article>
              <article className={styles.metric}><p>الدخل المتوقع</p><strong>٨٤٬٢٠٠ <em>ر.س</em></strong><small>توزيعات + صكوك + إيجارات / ١٢ شهر</small></article>
              <article className={styles.metric}><p>السيولة</p><strong>٩٦٬٢٠٠ <em>ر.س</em></strong><small>٢٫٩٪ من صافي الثروة</small></article>
            </div>
          </section>

          <section className={styles.gridTwo}>
            <article className={styles.panel}>
              <div className={styles.panelTitle}><div><h2>توزيع الثروة</h2><p>جميع فئات أصولك في مكان واحد</p></div><span>عرض الكل</span></div>
              <div className={styles.rows}>
                {allocation.map(([name, value, share]) => (
                  <div className={styles.assetRow} key={name}>
                    <div className={styles.assetName}><i /><span><strong>{name}</strong><small>{share} من الثروة</small></span></div>
                    <strong className={styles.assetValue}>{value}</strong>
                  </div>
                ))}
              </div>
            </article>

            <article className={styles.panel}>
              <div className={styles.panelTitle}><div><h2>مؤشرات تستحق الانتباه</h2><p>قراءة مبسطة لوضع ثروتك</p></div></div>
              <div className={styles.insights}>
                <div><span>٠١</span><section><strong>تركيز مرتفع في القطاع البنكي السعودي</strong><p>٣١٪ من محفظتك السائلة مرتبطة بالبنوك السعودية، وهي أعلى من المستوى المرجعي الذي حددته للمتابعة.</p></section></div>
                <div><span>٠٢</span><section><strong>الدخل السنوي في تحسن</strong><p>التوزيعات المتوقعة أعلى بـ ١٢٬٦٠٠ ر.س مقارنةً بالاثني عشر شهرًا السابقة.</p></section></div>
                <div><span>٠٣</span><section><strong>الالتزام الشرعي: ٩٦٪</strong><p>معظم الأصول مصنفة متوافقة، مع أصول بقيمة ٤٧٬٥٠٠ ر.س تحتاج إلى مراجعة.</p></section></div>
              </div>
            </article>
          </section>

          <section className={styles.gridTwoBottom}>
            <article className={styles.panel}>
              <div className={styles.panelTitle}><div><h2>الحسابات والمحافظ</h2><p>مصادر البيانات المضافة إلى لوحة ثروتك</p></div><span>إدارة</span></div>
              <div className={styles.accountRows}>
                {accounts.map(([name, type, value, status]) => (
                  <div className={styles.accountRow} key={name}>
                    <div className={styles.accountLogo}>{name.slice(0,1)}</div>
                    <div className={styles.accountName}><strong>{name}</strong><small>{type}</small></div>
                    <div className={styles.accountValue}>{value}</div>
                    <div className={styles.accountStatus}><i />{status}</div>
                  </div>
                ))}
              </div>
            </article>

            <article className={styles.askPanel}>
              <small>ذكاء الثروة</small>
              <h2>اسأل عن ثروتك</h2>
              <p>حلّل استثماراتك ودخلك ومخاطرك بلغة بسيطة اعتمادًا على بياناتك المجمّعة.</p>
              <div className={styles.question}>كم ربحت من الأسهم السعودية هذا العام؟</div>
              <div className={styles.question}>لو انخفض السوق ٢٠٪، كيف يتغير صافي ثروتي؟</div>
              <div className={styles.question}>كم نسبة ثروتي المعرّضة للدولار؟</div>
              <div className={styles.searchBox}><span>اكتب سؤالك عن ثروتك...</span><b>←</b></div>
            </article>
          </section>
        </div>
      </section>
    </main>
  );
}
