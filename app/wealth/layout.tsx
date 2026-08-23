import "./wealth-font.css";
import "./wealth-no-effects.css";
import WealthSaudiMarketAutoRefresh from "./WealthSaudiMarketAutoRefresh";

export default function WealthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="wealth-tahoma">
      <WealthSaudiMarketAutoRefresh />
      {children}
    </div>
  );
}
