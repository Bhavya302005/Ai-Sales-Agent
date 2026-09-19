import { type NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  if (!request.cookies.has("sales_agent_session")) {
    return NextResponse.redirect(new URL("/login", request.url));
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
    "/voice-lab/:path*",
    "/onboarding/:path*",
    "/sources/:path*",
  ],
};
