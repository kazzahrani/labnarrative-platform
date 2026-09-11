import { createPublicBotSocialImage } from "../../../../bot/[slug]/social-card";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string; snapshot: string }> },
) {
  const { slug, snapshot } = await params;

  if (!/^[A-Za-z0-9_-]{8,80}$/.test(slug) || !/^[A-Za-z0-9_-]{1,120}$/.test(snapshot)) {
    return new Response("Not found", { status: 404 });
  }

  return createPublicBotSocialImage(slug);
}
