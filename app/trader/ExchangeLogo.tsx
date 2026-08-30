import styles from "./exchange-logo.module.css";

export type ExchangeProvider = "binance" | "bybit" | "okx" | "coinbase" | "kraken" | "kucoin";

type Props = { provider: ExchangeProvider; size?: number };

export function exchangeName(provider: string | null | undefined) {
  const value = String(provider || "binance").toLowerCase();
  if (value === "bybit") return "Bybit";
  if (value === "okx") return "OKX";
  if (value === "coinbase") return "Coinbase";
  if (value === "kraken") return "Kraken";
  if (value === "kucoin") return "KuCoin";
  return "Binance";
}

export default function ExchangeLogo({ provider, size = 34 }: Props) {
  const common = { width: size, height: size, viewBox: "0 0 40 40", "aria-hidden": true } as const;
  if (provider === "binance") return <svg {...common} className={`${styles.logo} ${styles.binance}`}><rect x="17" y="5" width="6" height="6" transform="rotate(45 20 8)"/><rect x="9" y="13" width="6" height="6" transform="rotate(45 12 16)"/><rect x="17" y="13" width="6" height="6" transform="rotate(45 20 16)"/><rect x="25" y="13" width="6" height="6" transform="rotate(45 28 16)"/><rect x="17" y="21" width="6" height="6" transform="rotate(45 20 24)"/></svg>;
  if (provider === "okx") return <svg {...common} className={`${styles.logo} ${styles.okx}`}><rect x="6" y="6" width="8" height="8"/><rect x="16" y="6" width="8" height="8"/><rect x="26" y="6" width="8" height="8"/><rect x="6" y="16" width="8" height="8"/><rect x="16" y="16" width="8" height="8"/><rect x="26" y="26" width="8" height="8"/><rect x="16" y="26" width="8" height="8"/></svg>;
  if (provider === "coinbase") return <svg {...common} className={`${styles.logo} ${styles.coinbase}`}><circle cx="20" cy="20" r="14"/><circle cx="20" cy="20" r="7" className={styles.cut}/><rect x="20" y="14" width="8" height="12" className={styles.cut}/></svg>;
  if (provider === "kraken") return <svg {...common} className={`${styles.logo} ${styles.kraken}`}><path d="M7 25V19C7 11.8 12.8 6 20 6s13 5.8 13 13v6h-5v-5h-3v5h-4v-5h-3v5h-4v-5h-3v5H7Z"/></svg>;
  if (provider === "kucoin") return <svg {...common} className={`${styles.logo} ${styles.kucoin}`}><circle cx="10" cy="8" r="3"/><circle cx="10" cy="32" r="3"/><circle cx="30" cy="20" r="3"/><circle cx="21" cy="20" r="3"/><path d="M10 11v18M12 20h6M23 18l5-7M23 22l5 7" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round"/></svg>;
  return <svg {...common} className={`${styles.logo} ${styles.bybit}`}><path d="M7 9h7.5c5 0 7.5 1.7 7.5 5.2 0 2.1-1.1 3.7-3.2 4.5 2.8.7 4.2 2.5 4.2 5.3 0 4.5-3.2 7-9.3 7H7V9Zm7.1 8c2.4 0 3.5-.7 3.5-2.2 0-1.4-1.1-2.1-3.4-2.1h-2.8V17h2.7Zm.5 10.2c2.7 0 4-.9 4-2.7 0-1.8-1.3-2.7-4-2.7h-3.2v5.4h3.2Z"/><path d="M27 9h5v22h-5z" className={styles.bybitAccent}/></svg>;
}
