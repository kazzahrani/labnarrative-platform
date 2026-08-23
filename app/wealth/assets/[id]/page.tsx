import AssetDetailClient from "./AssetDetailClient";

export const metadata = {
  title: "تفاصيل الأصل — ثروة",
};

export default async function WealthAssetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AssetDetailClient holdingId={id} />;
}
