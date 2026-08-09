"use client";

import { useParams } from "next/navigation";
import VisualSiteEditor from "@/components/admin/VisualSiteEditor";

export default function SiteEditorPage() {
  const params = useParams<{ slug: string }>();
  const slug = decodeURIComponent(String(params?.slug || ""));
  return <VisualSiteEditor slug={slug} />;
}
