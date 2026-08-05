export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const response = await fetch(
    "https://umhkpflyzlifiufvejwr.supabase.co/functions/v1/recover-helen-6c9e2a84d61f",
    { cache: "no-store" },
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
