import "./wealth-font.css";

export default function WealthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <div className="wealth-tahoma">{children}</div>;
}
