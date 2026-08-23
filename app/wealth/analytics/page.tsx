import AnalyticsClient from "./AnalyticsClient";

export const metadata = {
  title: "التحليلات — ثروة",
  description: "تحليلات أداء وتركيز ومخاطر محفظة ثروة.",
};

export default function WealthAnalyticsPage() {
  return <AnalyticsClient />;
}
