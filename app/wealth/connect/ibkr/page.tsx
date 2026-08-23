import IBKRConnectClient from "./IBKRConnectClient";

export const metadata = {
  title: "ربط Interactive Brokers — ثروة",
  description: "ربط Interactive Brokers عبر Flex Web Service للقراءة والتقارير فقط.",
};

export default function IBKRConnectPage() {
  return <IBKRConnectClient />;
}
