import type {Metadata} from "next";
import AdminControlCenterGate from "@/components/admin/AdminControlCenterGate";
import AdminVideoStudio from "@/components/admin/AdminVideoStudio";

export const dynamic="force-dynamic";
export const revalidate=0;
export const metadata:Metadata={title:"Video Studio · LabNarrative Control Center",robots:{index:false,follow:false}};

export default function VideoStudioPage(){
 return <AdminControlCenterGate><AdminVideoStudio /></AdminControlCenterGate>;
}
