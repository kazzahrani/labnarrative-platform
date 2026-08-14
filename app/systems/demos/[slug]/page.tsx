import { createClient } from "@supabase/supabase-js";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import MasterOperationsDemoClient from "./MasterOperationsDemoClient";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

type DemoProspect = {
  company_name: string;
  slug: string;
  demo_status: string;
  demo_config: Record<string, unknown> | null;
  industry: string | null;
  city: string | null;
  country: string | null;
};

async function getProspect(slug: string): Promise<DemoProspect | null> {
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase
    .from("systems_outreach_prospects")
    .select("company_name,slug,demo_status,demo_config,industry,city,country")
    .eq("slug", slug)
    .eq("demo_status", "ready")
    .maybeSingle();

  if (error || !data?.demo_config) return null;
  return data as DemoProspect;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const prospect = await getProspect(slug);
  if (!prospect) {
    return {
      title: "Private Systems Concept | LabNarrative",
      robots: { index: false, follow: false, nocache: true },
    };
  }

  return {
    title: `Private Concept — ${prospect.company_name} | LabNarrative Systems`,
    description: `A private illustrative LabNarrative Systems concept connecting tenders, quotations, orders, warehouse, supply, invoicing, collections and management visibility for ${prospect.company_name}.`,
    robots: { index: false, follow: false, nocache: true },
  };
}

export default async function DynamicSystemsDemoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const prospect = await getProspect(slug);
  if (!prospect) notFound();

  return (
    <MasterOperationsDemoClient
      companyName={prospect.company_name}
      industry={prospect.industry ?? "Business operations"}
      location={[prospect.city, prospect.country].filter(Boolean).join(", ")}
      config={prospect.demo_config ?? {}}
    />
  );
}
