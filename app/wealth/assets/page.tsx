import AssetsClientV3 from "./AssetsClientV3";

export const metadata = {
  title: "الأصول — ثروة",
  description: "استعراض وإدارة جميع الأصول والاستثمارات في منصة ثروة.",
};

export default function WealthAssetsPage() {
  return <AssetsClientV3 />;
}
