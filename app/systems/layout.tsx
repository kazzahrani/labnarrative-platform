import type { ReactNode } from "react";
import ArabicDigitLocalizer from "./ArabicDigitLocalizer";
import "./typography.css";

export default function SystemsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="lnSystemsTypography">
      <ArabicDigitLocalizer />
      {children}
    </div>
  );
}
