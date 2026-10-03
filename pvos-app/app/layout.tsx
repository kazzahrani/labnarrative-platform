import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
export const metadata: Metadata={
  title:"PVOS",
  description:"Pharmacovigilance operations and compliance workspace",
  robots:{index:false,follow:false},
  icons:{
    icon:[{url:"/pvos-logo.svg",type:"image/svg+xml"}],
    shortcut:"/pvos-logo.svg",
    apple:"/pvos-logo.svg",
  },
};
export default function RootLayout({children}:{children:ReactNode}){return <html lang="en"><body>{children}</body></html>}
