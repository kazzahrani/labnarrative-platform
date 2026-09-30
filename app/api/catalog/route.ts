import { NextResponse } from "next/server";
import { databaseConfigured, listCatalog } from "@/lib/supabase-rest";

const fallback = [
  { id: "demo-1", name: "Split AC installation", name_ar: "تركيب مكيف سبليت", unit: "unit", unit_price: 450 },
  { id: "demo-2", name: "AC cleaning", name_ar: "تنظيف مكيف", unit: "unit", unit_price: 150 },
  { id: "demo-3", name: "Copper piping / meter", name_ar: "تمديد نحاس / متر", unit: "meter", unit_price: 75 },
  { id: "demo-4", name: "Site visit", name_ar: "زيارة موقع", unit: "visit", unit_price: 200 }
];

export async function GET() {
  if (!databaseConfigured()) return NextResponse.json({ items: fallback, mode: "demo" });
  try {
    const items = await listCatalog();
    return NextResponse.json({ items, mode: "database" });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ items: fallback, mode: "fallback" });
  }
}
