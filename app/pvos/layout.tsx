import type { ReactNode } from "react";
import { AppShell } from "./_components";
import { PVOSProvider } from "./_provider";

export const metadata = {
  title:"PVOS",
  description:"Pharmacovigilance operations and compliance workspace",
  robots:{ index:false, follow:false },
};

export default function PVOSLayout({children}:{children:ReactNode}){
  return <PVOSProvider><AppShell>{children}</AppShell></PVOSProvider>;
}
