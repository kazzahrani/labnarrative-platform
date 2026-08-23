import WealthLoginClient from "./WealthLoginClient";

export const metadata = {
  title: "الدخول إلى ثروة",
  description: "دخول آمن إلى منصة ثروة لحفظ وإدارة بياناتك الاستثمارية.",
};

export default function WealthLoginPage() {
  return <WealthLoginClient />;
}
