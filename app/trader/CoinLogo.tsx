"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

type CoinLogoProps = {
  symbol: string;
  size?: number;
  className?: string;
  priority?: boolean;
};

function baseAsset(value: string) {
  const clean = String(value || "").trim().toUpperCase();
  const first = clean.split(/[\/-]/)[0] || clean;
  return first.replace(/[^A-Z0-9]/g, "") || "COIN";
}

export default function CoinLogo({ symbol, size = 20, className, priority = false }: CoinLogoProps) {
  const asset = useMemo(() => baseAsset(symbol), [symbol]);
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [asset]);

  const shellStyle = {
    width: size,
    height: size,
    minWidth: size,
    minHeight: size,
    borderRadius: "50%",
    display: "inline-grid",
    placeItems: "center",
    overflow: "hidden",
    verticalAlign: "middle",
    flex: "0 0 auto",
  } as const;

  if (failed) {
    return <span className={className} style={{ ...shellStyle, border: "1px solid #3d4248", background: "#292d32", color: "#aab0b7", fontSize: Math.max(8, Math.round(size * 0.38)), fontWeight: 700 }} aria-hidden="true">{asset.slice(0, 2)}</span>;
  }

  return <span className={className} style={shellStyle} aria-hidden="true">
    <Image
      src={`https://cdn.jsdelivr.net/gh/prasangapokharel/crypto-icons@v1.0.0/binance/${asset}.png`}
      alt=""
      width={size}
      height={size}
      loading={priority ? "eager" : "lazy"}
      priority={priority}
      onError={() => setFailed(true)}
      style={{ width: size, height: size, objectFit: "contain", borderRadius: "50%" }}
    />
  </span>;
}
