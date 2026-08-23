import WealthArabicNumberNormalizer from "./WealthArabicNumberNormalizer";
import "./wealth-font.css";

export default function WealthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="wealth-tahoma">
      <WealthArabicNumberNormalizer>{children}</WealthArabicNumberNormalizer>
    </div>
  );
}
