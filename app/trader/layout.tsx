import type { ReactNode } from "react";
import "./brand-mark.css";
import "./sidebar-icons.css";
import TraderCreatorAffiliateLink from "./TraderCreatorAffiliateLink";

export default function TraderLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <>{children}<TraderCreatorAffiliateLink /></>;
}
