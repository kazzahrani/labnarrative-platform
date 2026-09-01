import { NextRequest, NextResponse } from "next/server";

const RESERVED_SUBDOMAINS = new Set(["www", "platform", "admin", "api", "tenders", "app", "career", "trader-gateway"]);
const PLATFORM_ALIAS_HOSTS = new Set([
  "labnarrative-platform.vercel.app",
  "labnarrative-platform-lab-narrative.vercel.app",
  "labnarrative-platform-git-main-lab-narrative.vercel.app",
]);
const LEGACY_PLATFORM_HOST = "platform.labnarrative.com";
const REFERRAL_PENDING_COOKIE = "ln_referral_pending_v1";
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

function normalizeReferralCode(value: string | null) {
  return String(value ?? "").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 32);
}

export function proxy(request: NextRequest) {
  const host = request.headers.get("host")?.split(":")[0].toLowerCase() ?? "";
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "labnarrative.com";
  const isAdminHost =
    host === rootDomain ||
    host === `www.${rootDomain}` ||
    host === LEGACY_PLATFORM_HOST ||
    host === "localhost";
  const isTendersHost = host === `tenders.${rootDomain}`;
  const isSaasHost = host === `app.${rootDomain}`;
  const isCareerHost = host === `career.${rootDomain}`;
  const isTraderHost =
    host === rootDomain ||
    host === `www.${rootDomain}` ||
    host === LEGACY_PLATFORM_HOST ||
    host === "localhost" ||
    host.endsWith(".vercel.app");

  const referralCode = normalizeReferralCode(request.nextUrl.searchParams.get("ref"));
  if (
    isTraderHost &&
    referralCode.length >= 4 &&
    (request.nextUrl.pathname === "/trader" || request.nextUrl.pathname.startsWith("/trader/"))
  ) {
    const response = NextResponse.next();
    response.cookies.set(REFERRAL_PENDING_COOKIE, referralCode, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 10,
    });
    return response;
  }

  if (request.nextUrl.pathname.startsWith("/engine-v4/render/")) {
    const response = NextResponse.next();
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
    return response;
  }

  if (request.nextUrl.pathname.startsWith("/admin") && PLATFORM_ALIAS_HOSTS.has(host)) {
    const canonicalUrl = request.nextUrl.clone();
    canonicalUrl.protocol = "https:";
    canonicalUrl.hostname = rootDomain;
    canonicalUrl.port = "";
    return NextResponse.redirect(canonicalUrl, 307);
  }

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

  if (isAdminHost && request.nextUrl.pathname === "/admin") {
    const response = NextResponse.next();
    response.headers.set("Cache-Control", "private, no-store, max-age=0, must-revalidate");
    response.headers.set("Pragma", "no-cache");
    response.headers.set("Expires", "0");
    return response;
  }

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

  if (isAdminHost && (request.nextUrl.pathname === "/admin/websites" || request.nextUrl.pathname === "/admin/websites/")) {
    const response = NextResponse.next();
    response.headers.set("Cache-Control", "private, no-store, max-age=0, must-revalidate");
    return response;
  }

  if (isAdminHost && request.nextUrl.pathname === "/admin/websites/outreach") {
    const outreachUrl = request.nextUrl.clone();
    outreachUrl.pathname = "/admin/outreach-setup";
    return NextResponse.rewrite(outreachUrl);
  }

  if (isAdminHost && request.nextUrl.pathname.startsWith("/admin/websites/")) {
    const internalUrl = request.nextUrl.clone();
    internalUrl.pathname = `/admin/${request.nextUrl.pathname.slice("/admin/websites/".length)}`;
    return NextResponse.rewrite(internalUrl);
  }

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

  if (request.nextUrl.pathname === "/api" || request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // The previous app.labnarrative.com product surface has been retired. Keep the
  // hostname reserved for the clean rebuild without falling through to another app.
  if (isSaasHost) {
    return new NextResponse("Not Found", {
      status: 404,
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "X-Robots-Tag": "noindex, nofollow, noarchive",
      },
    });
  }

  // Personal Career Agent application on its dedicated LabNarrative hostname.
  if (isCareerHost && request.nextUrl.pathname === "/") {
    const careerUrl = request.nextUrl.clone();
    careerUrl.pathname = "/api/career/page";
    return NextResponse.rewrite(careerUrl);
  }

  // Legacy tender product surface retained while the new SaaS is introduced.
  if (isTendersHost && request.nextUrl.pathname === "/") {
    const tendersUrl = request.nextUrl.clone();
    tendersUrl.pathname = "/tenders";
    return NextResponse.rewrite(tendersUrl);
  }

  // labnarrative.com currently remains the flagship revenue-intelligence experience.
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
