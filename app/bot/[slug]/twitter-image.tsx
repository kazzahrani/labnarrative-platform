import { createPublicBotSocialImage, socialImageSize } from "./social-card";

export const alt = "LabNarrative public Paper bot live analytics";
export const size = socialImageSize;
export const contentType = "image/png";

export default async function TwitterImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return createPublicBotSocialImage(slug);
}
