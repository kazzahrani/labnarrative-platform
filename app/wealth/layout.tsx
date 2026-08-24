import { Suspense } from "react";
import "./wealth-font.css";
import "./wealth-no-effects.css";
import WealthSaudiMarketAutoRefresh from "./WealthSaudiMarketAutoRefresh";
import WealthNavEnhancer from "./WealthNavEnhancer";
import WealthPricingIntegrity from "./WealthPricingIntegrity";

export default function WealthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="wealth-tahoma">
      <WealthSaudiMarketAutoRefresh />
      <WealthNavEnhancer />
      <Suspense fallback={null}>
        <WealthPricingIntegrity />
      </Suspense>
      {children}
    </div>
  );
}
