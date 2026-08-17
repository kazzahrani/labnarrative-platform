import type { ReactNode } from "react";
import ArabicDigitLocalizer from "./ArabicDigitLocalizer";
import DefaultLightTheme from "./DefaultLightTheme";
import "./typography.css";
import "./colorful-public.css";

export default function SystemsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="lnSystemsTypography lnSystemsPublic">
      <DefaultLightTheme />
      <ArabicDigitLocalizer />
      {children}
    </div>
  );
}
