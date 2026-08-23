import AskWealthClient from "./AskWealthClient";

export const metadata = {
  title: "اسأل ثروتي — ثروة",
  description: "مساعد محفظة ثروة للإجابة من بيانات الأصول والحسابات والدخل مباشرة.",
};

export default function AskWealthPage() {
  return <AskWealthClient />;
}
