"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { browserSupabase } from "@/lib/supabase-browser";
import styles from "../login/login.module.css";

function safeNext(value: string | null) {
  if (!value || !value.startsWith("/wealth")) return "/wealth";
  return value;
}

export default function ResetPasswordClient() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [nextPath, setNextPath] = useState("/wealth");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setNextPath(safeNext(params.get("next")));

    void browserSupabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });

    const { data: listener } = browserSupabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" && session) setReady(true);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  async function updatePassword() {
    setError("");
    setMessage("");

    if (!ready) {
      setError("افتح رابط استعادة كلمة المرور من البريد أولًا.");
      return;
    }
    if (password.length < 8) {
      setError("استخدم كلمة مرور من 8 أحرف على الأقل.");
      return;
    }
    if (password !== confirmPassword) {
      setError("كلمتا المرور غير متطابقتين.");
      return;
    }

    setLoading(true);
    try {
      const { error: updateError } = await browserSupabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setMessage("تم تحديث كلمة المرور. سيتم نقلك إلى ثروة الآن.");
      window.setTimeout(() => window.location.replace(nextPath), 900);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر تحديث كلمة المرور.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className={styles.page} dir="rtl">
      <section className={styles.shell}>
        <header className={styles.topline}>
          <Link href="/wealth/login" className={styles.back}>العودة إلى تسجيل الدخول</Link>
          <span className={styles.pill}>استعادة الحساب</span>
        </header>

        <div className={styles.grid}>
          <section className={styles.intro}>
            <span className={styles.eyebrow}>ثروة</span>
            <h1>اختر كلمة مرور جديدة.</h1>
            <p>هذه الصفحة تعمل بعد فتح رابط استعادة كلمة المرور المرسل إلى بريدك.</p>
            <div className={styles.notes}>
              <div><span>01</span><p>الرابط مؤقت ومخصص لحسابك فقط.</p></div>
              <div><span>02</span><p>كلمة المرور الجديدة تحفظ لدى Supabase Auth بشكل آمن.</p></div>
              <div><span>03</span><p>بعد التحديث تعود مباشرة إلى مسار ثروة الذي كنت تعمل عليه.</p></div>
            </div>
          </section>

          <section className={styles.card}>
            <div className={styles.copy}>
              <span>{ready ? "الرابط صالح" : "بانتظار رابط الاستعادة"}</span>
              <h2>{ready ? "كلمة مرور جديدة." : "افتح الرابط من بريدك."}</h2>
              <p>{ready ? "اكتب كلمة المرور الجديدة مرتين ثم احفظها." : "إذا وصلت إلى هذه الصفحة بدون رابط الاستعادة، ارجع إلى تسجيل الدخول واطلب رابطًا جديدًا."}</p>
            </div>

            {ready ? (
              <div className={styles.form}>
                <label>
                  <span>كلمة المرور الجديدة</span>
                  <input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="8 أحرف على الأقل" />
                </label>
                <label>
                  <span>تأكيد كلمة المرور</span>
                  <input type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void updatePassword(); }} placeholder="أعد كتابة كلمة المرور" />
                </label>
                <button type="button" className={styles.primary} disabled={loading} onClick={() => void updatePassword()}>
                  {loading ? "جارٍ الحفظ…" : "حفظ كلمة المرور الجديدة"}
                </button>
              </div>
            ) : (
              <Link href={`/wealth/login?next=${encodeURIComponent(nextPath)}`} className={styles.back}>طلب رابط استعادة جديد</Link>
            )}

            {error ? <div className={styles.error}>{error}</div> : null}
            {message ? <div className={styles.message}>{message}</div> : null}
          </section>
        </div>
      </section>
    </main>
  );
}
