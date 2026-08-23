import AccountsClient from "./AccountsClient";

export const metadata = {
  title: "الحسابات — ثروة",
  description: "إدارة حسابات ومحافظ ثروة في مكان واحد.",
};

export default function WealthAccountsPage() {
  return <AccountsClient />;
}
