import { NextRequest, NextResponse } from "next/server";

const RESERVED_SUBDOMAINS = new Set(["www", "platform", "admin", "api"]);
const PLATFORM_ALIAS_HOSTS = new Set([
  "labnarrative-platform.vercel.app",
  "labnarrative-platform-lab-narrative.vercel.app",
  "labnarrative-platform-git-main-lab-narrative.vercel.app",
]);
const CANONICAL_PLATFORM_HOST = "platform.labnarrative.com";

export function proxy(request: NextRequest) {
  const host = request.headers.get("host")?.split(":")[0].toLowerCase() ?? "";
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "labnarrative.com";

  // Engine v4 machine renderer capability URLs are short-lived private
  // verification surfaces. Prevent the token in the query string from being
  // forwarded as a Referer to remote portrait hosts or indexed/cached.
  if (request.nextUrl.pathname.startsWith("/engine-v4/render/")) {
    const response = NextResponse.next();
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
    return response;
  }

  // Keep the administrator session on one browser origin. Supabase stores its
  // browser session per origin, so opening an admin page through a Vercel alias
  // creates a separate session from platform.labnarrative.com.
  if (request.nextUrl.pathname.startsWith("/admin") && PLATFORM_ALIAS_HOSTS.has(host)) {
    const canonicalUrl = request.nextUrl.clone();
    canonicalUrl.protocol = "https:";
    canonicalUrl.hostname = CANONICAL_PLATFORM_HOST;
    canonicalUrl.port = "";
    return NextResponse.redirect(canonicalUrl, 307);
  }

  // API routes are platform infrastructure and must remain addressable from
  // every custom laboratory subdomain without being rewritten as site pages.
  if (request.nextUrl.pathname === "/api" || request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  if (
    !host ||
    host === rootDomain ||
    host === `www.${rootDomain}` ||
    host === "localhost" ||
    host.endsWith(".vercel.app")
  ) {
    return NextResponse.next();
  }

  if (host.endsWith(`.${rootDomain}`)) {
    const subdomain = host.slice(0, -(rootDomain.length + 1)).split(".")[0];

    if (!subdomain || RESERVED_SUBDOMAINS.has(subdomain)) {
      return NextResponse.next();
    }

    const url = request.nextUrl.clone();
    const internalPrefix = `/sites/${subdomain}`;

    // Public subdomains should expose clean paths such as /research. Older
    // renderer links may already include /sites/{slug}; strip that prefix
    // before applying the hostname rewrite so it is never duplicated.
    const publicPath = url.pathname === internalPrefix
      ? "/"
      : url.pathname.startsWith(`${internalPrefix}/`)
        ? url.pathname.slice(internalPrefix.length)
        : url.pathname;

    const suffix = publicPath === "/" ? "" : publicPath;
    url.pathname = `${internalPrefix}${suffix}`;

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-labnarrative-public-subdomain", subdomain);
    return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)"],
};
