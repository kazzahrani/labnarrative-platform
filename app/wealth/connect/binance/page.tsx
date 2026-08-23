import BinanceConnectClient from "./BinanceConnectClient";

export const metadata = {
  title: "ربط Binance — ثروة",
  description: "ربط Binance بصلاحية قراءة فقط لمزامنة الأصول الرقمية مع ثروة.",
};

export default function BinanceConnectPage() {
  return <BinanceConnectClient />;
}
