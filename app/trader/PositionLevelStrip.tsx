"use client";

import styles from "./position-level-strip.module.css";

type Fill = {
  kind: "Base" | "Averaging";
  price: number;
  amount: number;
  quantity: number;
  at: string;
};

type Props = {
  averagePrice: number;
  currentPrice: number | null;
  stopLossPrice: number | null;
  takeProfitPrice: number | null;
  nextAveragingPrice: number | null;
  fills: Fill[];
  pnlPct: number;
  active: boolean;
};

type Level = {
  key: string;
  label: string;
  price: number;
  kind: "sl" | "dca" | "avg" | "tp";
};

const GREEN = "#6CB38C";
const RED = "#B26F74";

function finitePositive(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function uniqueApprox(values: number[]) {
  const result: number[] = [];
  for (const value of values) {
    if (!result.some((candidate) => Math.abs(candidate - value) <= Math.max(value, candidate) * 1e-8)) result.push(value);
  }
  return result;
}

export default function PositionLevelStrip({
  averagePrice,
  currentPrice,
  stopLossPrice,
  takeProfitPrice,
  nextAveragingPrice,
  fills,
  pnlPct,
  active,
}: Props) {
  const avg = finitePositive(averagePrice);
  const current = finitePositive(currentPrice) ?? avg;
  const sl = finitePositive(stopLossPrice);
  const tp = finitePositive(takeProfitPrice);
  const nextDca = finitePositive(nextAveragingPrice);

  const filledDcaPrices = uniqueApprox((fills ?? [])
    .filter((fill) => String(fill.kind).toLowerCase() === "averaging")
    .map((fill) => finitePositive(fill.price))
    .filter((price): price is number => price != null))
    .slice(-4);

  const levels: Level[] = [];
  if (sl) levels.push({ key: "sl", label: "SL", price: sl, kind: "sl" });
  filledDcaPrices.forEach((price, index) => levels.push({ key: `dca-${index}`, label: `D${index + 1}`, price, kind: "dca" }));
  if (nextDca && !filledDcaPrices.some((price) => Math.abs(price - nextDca) <= Math.max(price, nextDca) * 1e-8)) {
    levels.push({ key: "dca-next", label: "D+", price: nextDca, kind: "dca" });
  }
  if (avg) levels.push({ key: "avg", label: "AVG", price: avg, kind: "avg" });
  if (tp) levels.push({ key: "tp", label: "TP", price: tp, kind: "tp" });

  const prices = [
    ...levels.map((level) => level.price),
    ...(current ? [current] : []),
  ];
  const fallback = avg ?? current ?? 1;
  let min = prices.length ? Math.min(...prices) : fallback * .98;
  let max = prices.length ? Math.max(...prices) : fallback * 1.02;
  if (max <= min) {
    min = fallback * .99;
    max = fallback * 1.01;
  }
  const span = Math.max(max - min, fallback * .003, 1e-12);
  min -= span * .08;
  max += span * .08;

  const left = 12;
  const right = 288;
  const baselineY = 28;
  const x = (price: number) => left + (price - min) / (max - min) * (right - left);
  const avgX = avg ? x(avg) : (left + right) / 2;
  const currentX = current ? x(current) : avgX;
  const positive = Number(pnlPct) >= 0;
  const accent = positive ? GREEN : RED;
  const moveStart = Math.min(avgX, currentX);
  const moveEnd = Math.max(avgX, currentX);

  return <div className={styles.wrap} aria-label="Position levels">
    <svg className={styles.map} viewBox="0 0 300 56" role="img" preserveAspectRatio="none">
      <rect x=".5" y=".5" width="299" height="55" rx="12" className={styles.frame}/>
      <line x1={left} x2={right} y1={baselineY} y2={baselineY} className={styles.base}/>
      {Math.abs(moveEnd - moveStart) > .5 && <line x1={moveStart} x2={moveEnd} y1={baselineY} y2={baselineY} stroke={accent} strokeWidth="3" strokeLinecap="round"/>}
      {levels.map((level, index) => {
        const px = x(level.price);
        const labelAbove = index % 2 === 0;
        return <g key={level.key}>
          <line x1={px} x2={px} y1="19" y2="37" className={styles.levelTick}/>
          <text x={px} y={labelAbove ? 12 : 49} textAnchor="middle" className={styles.levelLabel}>{level.label}</text>
        </g>;
      })}
      <circle cx={currentX} cy={baselineY} r="5" fill={accent} className={styles.currentHalo}/>
      <circle cx={currentX} cy={baselineY} r="2.4" className={styles.currentDot}/>
      <text x={Math.max(18, Math.min(282, currentX))} y="12" textAnchor="middle" className={styles.currentLabel}>{active ? "NOW" : "EXIT"}</text>
    </svg>
  </div>;
}
