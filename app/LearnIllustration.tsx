import type { CSSProperties } from "react";

export type LearnVisual =
  | "paper"
  | "dca"
  | "tradingview"
  | "threecommas"
  | "bitsgap"
  | "cryptohopper"
  | "coinrule"
  | "general";

type Props = {
  visual?: LearnVisual;
  className?: string;
  style?: CSSProperties;
};

const palette = {
  ink: "#263241",
  cream: "#f0d2a7",
  gold: "#e6b35c",
  blue: "#6f8fb6",
  green: "#7fa481",
  coral: "#d97b70",
  slate: "#334454",
  paper: "#ead7b7",
};

export function visualForCategory(category: string): LearnVisual {
  const c = category.toLowerCase();
  if (c.includes("paper")) return "paper";
  if (c.includes("dca")) return "dca";
  if (c.includes("tradingview")) return "tradingview";
  if (c.includes("comparison")) return "general";
  return "general";
}

export default function LearnIllustration({ visual = "general", className, style }: Props) {
  const p = palette;
  const common = { fill: "none", stroke: p.ink, strokeWidth: 4, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

  const art = {
    paper: (
      <>
        <path d="M46 124c18-22 40-27 60-10 20-17 48-13 64 10" fill="#53604d" opacity=".95"/>
        <path d="M68 34h86v104H68z" fill={p.paper} {...common}/>
        <path d="M84 54l8 8 15-18M84 82l8 8 15-18M84 110l8 8 15-18" stroke={p.green} {...common}/>
        <path d="M116 54h24M116 64h18M116 82h24M116 92h18M116 110h24M116 120h18" {...common}/>
        <path d="M91 28h40v18H91z" fill={p.blue} {...common}/>
        <circle cx="48" cy="48" r="4" fill={p.gold}/><circle cx="164" cy="45" r="3" fill={p.gold}/>
      </>
    ),
    dca: (
      <>
        <path d="M37 133h146" stroke="#56614f" strokeWidth="8" strokeLinecap="round"/>
        <path d="M55 116l24-23 22 9 27-35 26 13" stroke={p.green} {...common}/>
        <path d="M151 80l14-17" stroke={p.green} {...common}/><path d="M158 63h7v8" stroke={p.green} {...common}/>
        <ellipse cx="73" cy="126" rx="24" ry="8" fill={p.gold} {...common}/>
        <ellipse cx="104" cy="119" rx="24" ry="8" fill={p.gold} {...common}/>
        <ellipse cx="136" cy="111" rx="24" ry="8" fill={p.gold} {...common}/>
        <path d="M49 126v12c0 7 48 7 48 0v-12M80 119v19c0 7 48 7 48 0v-19M112 111v27c0 7 48 7 48 0v-27" fill={p.gold} {...common}/>
        <circle cx="172" cy="42" r="4" fill={p.gold}/>
      </>
    ),
    tradingview: (
      <>
        <path d="M43 46h134v88H43z" fill={p.slate} {...common}/>
        <path d="M54 119h112" stroke="#1f2b36" strokeWidth="5" strokeLinecap="round"/>
        <path d="M61 102l24-28 21 12 25-36 27 16" stroke={p.green} {...common}/>
        <path d="M68 76v25M88 61v29M111 73v25M137 48v39M158 60v28" stroke={p.blue} {...common}/>
        <path d="M76 82v17M101 66v22M148 55v21" stroke={p.coral} {...common}/>
        <path d="M90 136h40M110 135v15" {...common}/>
        <circle cx="37" cy="42" r="4" fill={p.gold}/><circle cx="182" cy="52" r="3" fill={p.gold}/>
      </>
    ),
    threecommas: (
      <>
        <path d="M61 125c17-20 38-25 58-10 18-14 41-12 56 10" fill="#55614e"/>
        <circle cx="90" cy="82" r="42" fill={p.gold} {...common}/>
        <circle cx="90" cy="82" r="28" fill="#f2c977" {...common}/>
        <path d="M80 66h11c12 0 12 15 0 15h-11m0 0h14c13 0 13 17 0 17H80m8-39v46m13-44-3 7m5 31-4-7" {...common}/>
        <path d="M142 50l15 15m0-15l-15 15M142 82l15 15m0-15l-15 15" stroke={p.blue} {...common}/>
        <path d="M135 115h31" stroke={p.green} strokeWidth="7" strokeLinecap="round"/>
      </>
    ),
    bitsgap: (
      <>
        <path d="M48 125c18-21 40-25 60-8 18-16 42-13 58 8" fill="#53604d"/>
        <circle cx="82" cy="79" r="35" fill={p.blue} {...common}/>
        <path d="M65 78h34M65 66h34M65 90h34" {...common}/>
        <circle cx="142" cy="75" r="28" fill={p.gold} {...common}/>
        <path d="M127 75h30M142 60v30" {...common}/>
        <path d="M110 111c8 12 18 17 31 17 12 0 22-4 31-14" stroke={p.green} {...common}/>
      </>
    ),
    cryptohopper: (
      <>
        <path d="M47 128c17-20 39-24 59-8 19-15 42-12 59 8" fill="#53604d"/>
        <path d="M64 43h92v75H64z" fill={p.slate} {...common}/>
        <path d="M77 95l18-19 17 10 21-29 13 9" stroke={p.green} {...common}/>
        <path d="M72 129h76" stroke={p.ink} strokeWidth="7" strokeLinecap="round"/>
        <path d="M79 134h62" stroke={p.gold} strokeWidth="6" strokeLinecap="round"/>
        <path d="M153 47l13-14 7 9" stroke={p.coral} {...common}/>
      </>
    ),
    coinrule: (
      <>
        <path d="M48 127c17-19 38-24 58-8 19-15 43-13 60 8" fill="#53604d"/>
        <path d="M58 43h104v79H58z" fill={p.paper} {...common}/>
        <path d="M73 59h43M73 72h57M73 85h36M73 98h50" {...common}/>
        <circle cx="145" cy="95" r="24" fill={p.gold} {...common}/>
        <path d="M138 82h9c10 0 10 12 0 12h-9m0 0h11c11 0 11 14 0 14h-11m7-31v36" {...common}/>
        <path d="M57 53l-9-9M163 53l9-9" stroke={p.blue} {...common}/>
      </>
    ),
    general: (
      <>
        <path d="M43 128c20-23 44-28 65-9 20-17 45-14 66 9" fill="#53604d"/>
        <path d="M68 112l33-35 23 18 31-43" stroke={p.green} {...common}/>
        <path d="M145 52h12v13" stroke={p.green} {...common}/>
        <circle cx="76" cy="73" r="24" fill={p.gold} {...common}/>
        <circle cx="76" cy="73" r="14" fill="#f2c977" {...common}/>
        <path d="M70 61h8c10 0 10 12 0 12h-8m0 0h10c10 0 10 13 0 13H70m7-29v34" {...common}/>
        <path d="M119 38l9 9-9 9-9-9z" fill={p.blue} {...common}/>
        <circle cx="169" cy="40" r="4" fill={p.gold}/>
      </>
    ),
  }[visual];

  return (
    <svg className={className} style={style} viewBox="0 0 220 170" role="img" aria-hidden="true">
      {art}
    </svg>
  );
}
