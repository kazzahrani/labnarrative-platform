import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date("2026-09-09T00:00:00.000Z");

  return [
    {
      url: "https://labnarrative.com/",
      lastModified,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: "https://labnarrative.com/pricing",
      lastModified,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: "https://labnarrative.com/affiliate",
      lastModified,
      changeFrequency: "monthly",
      priority: 0.6,
    },
  ];
}
