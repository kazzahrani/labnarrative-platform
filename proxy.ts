import { NextRequest, NextResponse } from "next/server";

const RESERVED_SUBDOMAINS = new Set(["www", "platform", "admin", "api", "tenders", "app", "career", "trader-gateway"]);
const PLATFORM_ALIAS_HOSTS = new Set([
  "labnarrative-platform.vercel.app",
  "labnarrative-platform-lab-narrative.vercel.app",
  "labnarrative-platform-git-main-lab-narrative.vercel.app",
]);
const LEGACY_PLATFORM_HOST = "platform.labnarrative.com";
const SCIENTIFIC_SITE_HOSTS = new Set(["labnarrative.site", "www.labnarrative.site"]);
const SCIENTIFIC_PUBLIC_ROOT = "labnarrative.site";
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
  "lead-radar",
]);

function normalizeReferralCode(value: string | null) {
  return String(value ?? "").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 32);
}

export function proxy(request: NextRequest) {
  const host = request.headers.get("host")?.split(":")[0].toLowerCase() ?? "";
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "labnarrative.com";
  const pathname = request.nextUrl.pathname;

  // Keep the approved Bourdon concept exactly as-is while moving its public URL.
  // Every request (HTML, CSS, JS, images, RSC) is transparently proxied from the
  // approved concept host so the browser remains on bourdon.labnarrative.site.
  if (host === "bourdon.labnarrative.site") {
    const proxyUrl = request.nextUrl.clone();
    proxyUrl.pathname = "/api/bourdon-legacy-proxy";
    proxyUrl.search = "";
    proxyUrl.searchParams.set("path", `${pathname}${request.nextUrl.search}`);
    return NextResponse.rewrite(proxyUrl);
  }

  // Scientific client sites now live on <slug>.labnarrative.site.
  if (host.endsWith(`.${SCIENTIFIC_PUBLIC_ROOT}`) && !SCIENTIFIC_SITE_HOSTS.has(host)) {
    const subdomain = host.slice(0, -(SCIENTIFIC_PUBLIC_ROOT.length + 1)).split(".")[0];
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

  // Separate scientific-websites surface on labnarrative.site. This intentionally
  // shares the deployment while keeping the trading product on labnarrative.com.
  if (SCIENTIFIC_SITE_HOSTS.has(host)) {
    const scientificUrl = request.nextUrl.clone();

    // Dedicated Scientific admin. Keep the browser on labnarrative.site while
    // isolating it from the retired labnarrative.com admin/control center.
    if (pathname === "/admin/setup-password") {
      scientificUrl.pathname = "/scientific-password-setup";
      return NextResponse.rewrite(scientificUrl);
    }
    if (pathname === "/admin" || pathname.startsWith("/admin/")) {
      scientificUrl.pathname = `/scientific-admin${pathname.slice("/admin".length)}`;
      return NextResponse.rewrite(scientificUrl);
    }

    // Restore the original interactive proposal → PayPal → onboarding flow.
    if (
      pathname.startsWith("/proposal/") ||
      pathname.startsWith("/pay/") ||
      pathname.startsWith("/onboarding/")
    ) {
      return NextResponse.next();
    }

    const staticRoutes = new Map<string, string>([
      ["/", "/scientific-site/index.html"],
      ["/styles.css", "/scientific-site/styles.css"],
      ["/process", "/scientific-site/process/index.html"],
      ["/process/", "/scientific-site/process/index.html"],
      ["/clients/bourdon-a660d7d9", "/scientific-site/clients/bourdon-a660d7d9/index.html"],
      ["/clients/bourdon-a660d7d9/", "/scientific-site/clients/bourdon-a660d7d9/index.html"],
    ]);
    const target = staticRoutes.get(pathname);
    if (target) {
      scientificUrl.pathname = target;
      return NextResponse.rewrite(scientificUrl);
    }
    return new NextResponse("Not Found", {
      status: 404,
      headers: { "X-Robots-Tag": "noindex, nofollow" },
    });
  }

  if (host === "bourdon.labnarrative.com") {
    const target = request.nextUrl.clone();
    target.protocol = "https:";
    target.hostname = "bourdon.labnarrative.site";
    target.port = "";
    return NextResponse.redirect(target, 308);
  }

  // Retired Scientific onboarding review links should open the new .site admin.
  if (host === rootDomain || host === `www.${rootDomain}`) {
    const onboardingReview = pathname.match(/^\/admin\/sales\/([0-9a-f-]{36})\/onboarding\/?$/i);
    if (onboardingReview) {
      return NextResponse.redirect(
        new URL(`https://labnarrative.site/admin/clients/${onboardingReview[1]}/onboarding`),
        307,
      );
    }
  }

  // Keep the historic Bourdon proposal/process links useful after labnarrative.com
  // became the trading product.
  if (host === rootDomain || host === `www.${rootDomain}`) {
    if (
      pathname === "/proposal/a660d7d9-8c6c-4813-b21c-e72ac2fa14e3" ||
      pathname === "/proposal/a660d7d9-8c6c-4813-b21c-e72ac2fa14e3/"
    ) {
      return NextResponse.redirect(
        new URL("https://labnarrative.site/proposal/a660d7d9-8c6c-4813-b21c-e72ac2fa14e3/"),
        308,
      );
    }
    if (pathname === "/process" || pathname === "/process/") {
      return NextResponse.redirect(new URL("https://labnarrative.site/process/"), 308);
    }
  }
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
