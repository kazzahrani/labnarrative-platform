"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { browserSupabase } from "@/lib/supabase-browser";
import styles from "./login.module.css";

type Mode = "signin" | "signup";

function safeNext(value: string | null) {
  if (!value || !value.startsWith("/wealth")) return "/wealth";
  return value;
}

export default function WealthLoginClient() {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [nextPath, setNextPath] = useState("/wealth");

  const title = useMemo(() => mode === "signin" ? "مرحبًا بعودتك." : "أنشئ حساب ثروة.", [mode]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const next = safeNext(params.get("next"));
    setNextPath(next);

    void browserSupabase.auth.getSession().then(({ data }) => {
      if (data.session) window.location.replace(next);
    });
  }, []);

  async function submit() {
    if (!email.trim() || !password) {
      setError("أدخل البريد الإلكتروني وكلمة المرور.");
      return;
    }
    if (mode === "signup" && password.length < 8) {
      setError("استخدم كلمة مرور من 8 أحرف على الأقل.");
      return;
    }

    setLoading(true);
    setError("");
    setMessage("");

    try {
      if (mode === "signin") {
        const { data, error: authError } = await browserSupabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (authError || !data.session) throw authError || new Error("تعذر تسجيل الدخول.");
        window.location.replace(nextPath);
        return;
      }

      const { data, error: authError } = await browserSupabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: `${window.location.origin}${nextPath}`,
        },
      });
      if (authError) throw authError;
      if (data.session) {
        window.location.replace(nextPath);
        return;
      }
      setMessage("تم إنشاء الحساب. افتح رسالة التأكيد التي أرسلها Supabase إلى بريدك ثم عد إلى ثروة.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر إكمال العملية.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className={styles.page} dir="rtl">
      <section className={styles.shell}>
        <header className={styles.topline}>
          <Link href="/wealth" className={styles.back}>العودة إلى ثروة</Link>
          <span className={styles.pill}>دخول آمن</span>
        </header>

        <div className={styles.grid}>
          <section className={styles.intro}>
            <span className={styles.eyebrow}>ثروة</span>
            <h1>بياناتك المالية تبقى مرتبطة بك أنت فقط.</h1>
            <p>
              نستخدم تسجيل الدخول حتى نستطيع حفظ محافظك واستثماراتك بأمان، مع سياسات وصول تمنع أي مستخدم من رؤية بيانات مستخدم آخر.
            </p>
            <div className={styles.notes}>
              <div><span>01</span><p>لا نطلب كلمة مرور أي بنك أو وسيط استثماري.</p></div>
              <div><span>02</span><p>منصة ثروة في هذه المرحلة للعرض والتحليل فقط.</p></div>
              <div><span>03</span><p>بيانات المحافظ محمية بسياسات Row Level Security في Supabase.</p></div>
            </div>
          </section>

          <section className={styles.card}>
            <div className={styles.modeSwitch}>
              <button type="button" className={mode === "signin" ? styles.active : ""} onClick={() => { setMode("signin"); setError(""); setMessage(""); }}>تسجيل الدخول</button>
              <button type="button" className={mode === "signup" ? styles.active : ""} onClick={() => { setMode("signup"); setError(""); setMessage(""); }}>حساب جديد</button>
            </div>

            <div className={styles.copy}>
              <span>{mode === "signin" ? "حسابك" : "ابدأ الآن"}</span>
              <h2>{title}</h2>
              <p>{mode === "signin" ? "ادخل لحفظ محفظة عوائد ومتابعة ثروتك من أي جهاز." : "أنشئ حسابًا واحدًا لكل أصولك ومحافظك."}</p>
            </div>

            <div className={styles.form}>
              <label>
                <span>البريد الإلكتروني</span>
                <input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" />
              </label>
              <label>
                <span>كلمة المرور</span>
                <input
                  type="password"
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  onKeyDown={(event) => { if (event.key === "Enter") void submit(); }}
                  placeholder={mode === "signup" ? "8 أحرف على الأقل" : "••••••••"}
                />
              </label>
              <button type="button" className={styles.primary} disabled={loading} onClick={() => void submit()}>
                {loading ? "جاري التحقق…" : mode === "signin" ? "دخول إلى ثروة" : "إنشاء الحساب"}
              </button>
            </div>

            {error ? <div className={styles.error}>{error}</div> : null}
            {message ? <div className={styles.message}>{message}</div> : null}
            <p className={styles.security}>يتم تأمين الجلسة بواسطة Supabase Auth. لا نخزن كلمة المرور داخل تطبيق ثروة.</p>
          </section>
        </div>
      </section>
    </main>
  );
}
