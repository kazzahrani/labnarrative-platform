"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { browserSupabase } from "@/lib/supabase-browser";
import styles from "./login.module.css";

type Mode = "signin" | "signup" | "recovery";

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

  const title = useMemo(() => {
    if (mode === "signin") return "مرحبًا بعودتك.";
    if (mode === "signup") return "أنشئ حساب ثروة.";
    return "استعد حسابك.";
  }, [mode]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const next = safeNext(params.get("next"));
    setNextPath(next);

    void browserSupabase.auth.getSession().then(({ data }) => {
      if (data.session) window.location.replace(next);
    });
  }, []);

  function switchMode(nextMode: Mode) {
    setMode(nextMode);
    setError("");
    setMessage("");
    if (nextMode !== "signin") setPassword("");
  }

  async function submit() {
    if (!email.trim()) {
      setError("أدخل البريد الإلكتروني.");
      return;
    }
    if (mode !== "recovery" && !password) {
      setError("أدخل كلمة المرور.");
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

      if (mode === "recovery") {
        const recoveryUrl = `${window.location.origin}/wealth/reset-password?next=${encodeURIComponent(nextPath)}`;
        const { error: recoveryError } = await browserSupabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: recoveryUrl,
        });
        if (recoveryError) throw recoveryError;
        setMessage("إذا كان هذا البريد مرتبطًا بحساب، أرسلنا له رابط إعادة تعيين كلمة المرور. افحص الوارد وSpam ثم افتح الرابط.");
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
      setMessage("إذا كان البريد جديدًا، ستصلك رسالة تأكيد. إذا سبق استخدام هذا البريد، انتقل إلى تسجيل الدخول أو اختر «نسيت كلمة المرور؟» — لن يرسل Supabase رسالة إنشاء جديدة للحساب الموجود مسبقًا.");
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
              <button type="button" className={mode === "signin" ? styles.active : ""} onClick={() => switchMode("signin")}>تسجيل الدخول</button>
              <button type="button" className={mode === "signup" ? styles.active : ""} onClick={() => switchMode("signup")}>حساب جديد</button>
            </div>

            <div className={styles.copy}>
              <span>{mode === "signin" ? "حسابك" : mode === "signup" ? "ابدأ الآن" : "استعادة الوصول"}</span>
              <h2>{title}</h2>
              <p>
                {mode === "signin"
                  ? "ادخل لحفظ محفظة عوائد ومتابعة ثروتك من أي جهاز."
                  : mode === "signup"
                    ? "أنشئ حسابًا واحدًا لكل أصولك ومحافظك."
                    : "أدخل بريدك وسنرسل رابطًا آمنًا لاختيار كلمة مرور جديدة."}
              </p>
            </div>

            <div className={styles.form}>
              <label>
                <span>البريد الإلكتروني</span>
                <input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" />
              </label>

              {mode !== "recovery" ? (
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
              ) : null}

              {mode === "signin" ? (
                <button type="button" className={styles.textAction} onClick={() => switchMode("recovery")}>
                  نسيت كلمة المرور؟
                </button>
              ) : mode === "recovery" ? (
                <button type="button" className={styles.textAction} onClick={() => switchMode("signin")}>
                  العودة إلى تسجيل الدخول
                </button>
              ) : null}

              <button type="button" className={styles.primary} disabled={loading} onClick={() => void submit()}>
                {loading
                  ? "جاري التحقق…"
                  : mode === "signin"
                    ? "دخول إلى ثروة"
                    : mode === "signup"
                      ? "إنشاء الحساب"
                      : "إرسال رابط الاستعادة"}
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
