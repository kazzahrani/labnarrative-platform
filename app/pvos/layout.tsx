import type { ReactNode } from "react";
import { AppShell } from "./_components";
export const metadata = { title:"PVOS V0", description:"Saudi pharmacovigilance operations prototype" };
export default function PVOSLayout({children}:{children:ReactNode}){ return <AppShell>{children}</AppShell>; }
