import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
export const metadata: Metadata={
  title:"PVOS",
  description:"Pharmacovigilance operations and compliance workspace",
  robots:{index:false,follow:false},
  icons:{
    icon:[{url:"/pvos-mark.png",type:"image/png"}],
    shortcut:"/pvos-mark.png",
    apple:"/pvos-mark.png",
  },
};
export default function RootLayout({children}:{children:ReactNode}){return <html lang="en"><body>{children}</body></html>}
