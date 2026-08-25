import { Suspense } from "react";
import "./wealth-font.css";
import "./wealth-no-effects.css";
import "./wealth-preferences.css";
import WealthSaudiMarketAutoRefresh from "./WealthSaudiMarketAutoRefresh";
import WealthNavEnhancer from "./WealthNavEnhancer";
import WealthPricingIntegrity from "./WealthPricingIntegrity";
import WealthPreferences from "./WealthPreferences";
import WealthThemeRuntime from "./WealthThemeRuntime";

const preferenceBoot = `
try {
  var language = localStorage.getItem('tharwa:language') === 'en' ? 'en' : 'ar';
  var theme = localStorage.getItem('tharwa:theme') === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.wealthLang = language;
  document.documentElement.dataset.wealthTheme = theme;
  document.documentElement.lang = language;
} catch (_) {
  document.documentElement.dataset.wealthLang = 'ar';
  document.documentElement.dataset.wealthTheme = 'dark';
}
`;

export default function WealthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="wealth-tahoma">
      <script dangerouslySetInnerHTML={{ __html: preferenceBoot }} />
      <WealthSaudiMarketAutoRefresh />
      <WealthNavEnhancer />
      <WealthPreferences />
      <WealthThemeRuntime />
      <Suspense fallback={null}>
        <WealthPricingIntegrity />
      </Suspense>
      {children}
    </div>
  );
}
