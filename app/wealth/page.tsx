import WealthDashboardClient from "./WealthDashboardClient";
import DashboardNavEnhancer from "./DashboardNavEnhancer";

export const metadata = {
  title: "ثروة — لوحة الثروة السعودية",
  description: "منصة عربية بسيطة لتجميع ومتابعة الثروة والاستثمارات في مكان واحد.",
};

export default function WealthPage() {
  return (
    <>
      <WealthDashboardClient />
      <DashboardNavEnhancer />
    </>
  );
}
