import "./wealth-font.css";
import "./wealth-no-effects.css";
import WealthSaudiMarketAutoRefresh from "./WealthSaudiMarketAutoRefresh";
import WealthNavEnhancer from "./WealthNavEnhancer";

export default function WealthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="wealth-tahoma">
      <WealthSaudiMarketAutoRefresh />
      <WealthNavEnhancer />
      {children}
    </div>
  );
}
