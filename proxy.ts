import { NextRequest, NextResponse } from "next/server";

const RESERVED_SUBDOMAINS = new Set(["www", "platform", "admin", "api"]);
const PLATFORM_ALIAS_HOSTS = new Set([
  "labnarrative-platform.vercel.app",
  "labnarrative-platform-lab-narrative.vercel.app",
  "labnarrative-platform-git-main-lab-narrative.vercel.app",
]);
const LEGACY_PLATFORM_HOST = "platform.labnarrative.com";
const WEBSITE_ADMIN_SEGMENTS = new Set([
  "sites",
  "sites-v3",
  "sites-v4",
  "discovery",
  "review",
  "sales",
  "care",
  "linkedin",
  "outreach",
  "outreach-v2",
  "outreach-setup",
  "preview",
  "recovery",
]);

export function proxy(request: NextRequest) {
  const host = request.headers.get("host")?.split(":")[0].toLowerCase() ?? "";
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "labnarrative.com";
  const isAdminHost =
    host === rootDomain ||
    host === `www.${rootDomain}` ||
    host === LEGACY_PLATFORM_HOST ||
    host === "localhost";

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

  // labnarrative.com is the single canonical browser origin for the primary
  // administrator session. Vercel aliases never keep a separate auth copy.
  if (request.nextUrl.pathname.startsWith("/admin") && PLATFORM_ALIAS_HOSTS.has(host)) {
    const canonicalUrl = request.nextUrl.clone();
    canonicalUrl.protocol = "https:";
    canonicalUrl.hostname = rootDomain;
    canonicalUrl.port = "";
    return NextResponse.redirect(canonicalUrl, 307);
  }

  // Preserve platform.labnarrative.com only long enough to hand an existing
  // browser session to labnarrative.com. Every legacy admin URL enters the
  // transfer page first so the requested destination can be restored exactly.
  if (host === LEGACY_PLATFORM_HOST && request.nextUrl.pathname.startsWith("/admin")) {
    if (request.nextUrl.pathname === "/admin/session-transfer") {
      const response = NextResponse.next();
      response.headers.set("Cache-Control", "private, no-store, max-age=0, must-revalidate");
      response.headers.set("Pragma", "no-cache");
      response.headers.set("Expires", "0");
      return response;
    }

    if (request.nextUrl.pathname === "/admin/session-import") {
      const canonicalUrl = request.nextUrl.clone();
      canonicalUrl.protocol = "https:";
      canonicalUrl.hostname = rootDomain;
      canonicalUrl.port = "";
      return NextResponse.redirect(canonicalUrl, 307);
    }

    const transferUrl = request.nextUrl.clone();
    const requestedPath = `${request.nextUrl.pathname}${request.nextUrl.search}`;
    transferUrl.protocol = "https:";
    transferUrl.hostname = LEGACY_PLATFORM_HOST;
    transferUrl.port = "";
    transferUrl.pathname = "/admin/session-transfer";
    transferUrl.search = "";
    transferUrl.searchParams.set("return_to", requestedPath);
    return NextResponse.redirect(transferUrl, 307);
  }

  // /admin is the LabNarrative Control Center and shared login gate. Keep it
  // uncached so authentication state can never be hidden behind a stale page.
  if (isAdminHost && request.nextUrl.pathname === "/admin") {
    const response = NextResponse.next();
    response.headers.set("Cache-Control", "private, no-store, max-age=0, must-revalidate");
    response.headers.set("Pragma", "no-cache");
    response.headers.set("Expires", "0");
    return response;
  }

  // Session import/transfer are shared authentication infrastructure, not a
  // Websites namespace. Keep them directly addressable at top-level /admin.
  if (
    (host === rootDomain || host === `www.${rootDomain}` || host === "localhost") &&
    (request.nextUrl.pathname === "/admin/session-import" || request.nextUrl.pathname === "/admin/session-transfer")
  ) {
    const response = NextResponse.next();
    response.headers.set("Cache-Control", "private, no-store, max-age=0, must-revalidate");
    response.headers.set("Pragma", "no-cache");
    response.headers.set("Expires", "0");
    return response;
  }

  // /admin/websites is the Websites branch root and leads into the existing
  // Sites workspace.
  if (isAdminHost && (request.nextUrl.pathname === "/admin/websites" || request.nextUrl.pathname === "/admin/websites/")) {
    const sitesUrl = request.nextUrl.clone();
    sitesUrl.pathname = "/admin/websites/sites";
    return NextResponse.redirect(sitesUrl, 307);
  }

  // Give Websites a clean top-level outreach route while retaining the current
  // outreach setup implementation. Run-specific outreach URLs continue to map
  // through /admin/websites/outreach/[runId].
  if (isAdminHost && request.nextUrl.pathname === "/admin/websites/outreach") {
    const outreachUrl = request.nextUrl.clone();
    outreachUrl.pathname = "/admin/outreach-setup";
    return NextResponse.rewrite(outreachUrl);
  }

  // LabNarrative Websites lives under /admin/websites/*.
  if (isAdminHost && request.nextUrl.pathname.startsWith("/admin/websites/")) {
    const internalUrl = request.nextUrl.clone();
    internalUrl.pathname = `/admin/${request.nextUrl.pathname.slice("/admin/websites/".length)}`;
    return NextResponse.rewrite(internalUrl);
  }

  // Redirect legacy top-level Websites admin URLs on the public root into the
  // Websites namespace. Session routes were deliberately removed from this set.
  if (
    (host === rootDomain || host === `www.${rootDomain}` || host === "localhost") &&
    request.nextUrl.pathname.startsWith("/admin/")
  ) {
    const remainder = request.nextUrl.pathname.slice("/admin/".length);
    const firstSegment = remainder.split("/")[0];
    if (WEBSITE_ADMIN_SEGMENTS.has(firstSegment)) {
      const branchUrl = request.nextUrl.clone();
      branchUrl.pathname = `/admin/websites/${remainder}`;
      return NextResponse.redirect(branchUrl, 307);
    }
  }

  // API routes are platform infrastructure and must remain addressable from
  // every custom laboratory subdomain without being rewritten as site pages.
  if (request.nextUrl.pathname === "/api" || request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // The root LabNarrative brand acts as an umbrella for the businesses.
  if (
    request.nextUrl.pathname === "/" &&
    (
      host === rootDomain ||
      host === `www.${rootDomain}` ||
      host === "localhost" ||
      host.endsWith(".vercel.app")
    )
  ) {
    const umbrellaUrl = request.nextUrl.clone();
    umbrellaUrl.pathname = "/umbrella";
    return NextResponse.rewrite(umbrellaUrl);
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
