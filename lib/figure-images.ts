const INTERNAL_IMAGE_HOSTS = [
  "labnarrative.com",
  "supabase.co",
];

function isInternalImageHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return INTERNAL_IMAGE_HOSTS.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

export function proxiedFigureUrl(value?: string): string | undefined {
  if (!value) return undefined;
  if (value.startsWith("/")) return value;
  if (/^data:image\/(png|jpe?g|webp|gif);base64,[a-z0-9+/=\s]+$/i.test(value)) return value;

  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
    if (isInternalImageHost(url.hostname)) return url.toString();
    return `/api/figure?url=${encodeURIComponent(url.toString())}`;
  } catch {
    return undefined;
  }
}
