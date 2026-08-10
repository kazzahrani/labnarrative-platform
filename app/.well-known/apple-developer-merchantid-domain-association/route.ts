const ASSOCIATION_URL = "https://www.paypalobjects.com/devdoc/apple-pay/well-known/apple-developer-merchantid-domain-association";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const response = await fetch(ASSOCIATION_URL, { cache: "no-store", redirect: "follow" });
    if (!response.ok) return new Response("Apple Pay domain association unavailable.", { status: 502 });
    const body = await response.arrayBuffer();
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return new Response("Apple Pay domain association unavailable.", { status: 502 });
  }
}
