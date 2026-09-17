import type { Metadata } from "next";
import AdminControlCenterGate from "@/components/admin/AdminControlCenterGate";
import CreatorRewardsAdmin from "./CreatorRewardsAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = { title: "Creator Rewards — LabNarrative Admin", robots: { index: false, follow: false } };

export default function CreatorRewardsAdminPage(){
 return <AdminControlCenterGate><CreatorRewardsAdmin /></AdminControlCenterGate>;
}
