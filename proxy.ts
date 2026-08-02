import { NextRequest, NextResponse } from "next/server";

const RESERVED_SUBDOMAINS = new Set(["www", "platform", "admin", "api"]);

export function proxy(request: NextRequest) {
  const host = request.headers.get("host")?.split(":")[0].toLowerCase() ?? "";
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "labnarrative.com";

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
    const suffix = url.pathname === "/" ? "" : url.pathname;
    url.pathname = `/sites/${subdomain}${suffix}`;
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)"],
};
