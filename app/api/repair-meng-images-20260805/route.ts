export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const response = await fetch(
    "https://umhkpflyzlifiufvejwr.supabase.co/functions/v1/automation-worker",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "repair_images",
        runId: "7f7d05b6-f2d1-4f91-8891-023bd868bc31",
        repairToken: "repair-6e599f515245428ca85157dcf78768cf",
      }),
      cache: "no-store",
    },
  );

  const body = await response.text();
  return new Response(body, {
    status: response.status,
    headers: {
      "Content-Type": response.headers.get("content-type") || "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
