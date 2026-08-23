import WealthDashboardClient from "./WealthDashboardClient";

export const metadata = {
  title: "ثروة — لوحة الثروة السعودية",
  description: "منصة عربية بسيطة لتجميع ومتابعة الثروة والاستثمارات في مكان واحد.",
};

export default function WealthPage() {
  return <WealthDashboardClient />;
}
