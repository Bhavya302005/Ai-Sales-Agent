import { type NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  if (!request.cookies.has("sales_agent_session")) {
    const returnTo = encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(new URL(`/login?returnTo=${returnTo}`, request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/leads/:path*",
    "/campaigns/:path*",
    "/calls/:path*",
    "/analytics/:path*",
    "/settings/:path*",
    "/notifications/:path*",
    "/callbacks/:path*",
    "/admin/:path*",
    "/voice-lab/:path*",
    "/onboarding/:path*",
    "/sources/:path*",
  ],
};
