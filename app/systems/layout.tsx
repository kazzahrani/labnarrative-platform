import type { ReactNode } from "react";
import "./typography.css";

export default function SystemsLayout({ children }: { children: ReactNode }) {
  return <div className="lnSystemsTypography">{children}</div>;
}
