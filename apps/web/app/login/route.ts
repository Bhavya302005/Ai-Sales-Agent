import { type NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const apiBaseUrl = process.env.API_BASE_URL ?? "http://localhost:8000";
  const returnTo = request.nextUrl.searchParams.get("returnTo") || "/onboarding";
  const targetUrl = new URL(returnTo, request.url);

  try {
    const res = await fetch(`${apiBaseUrl}/api/v1/auth/dev-session`, {
      method: "POST",
      cache: "no-store",
    });
    if (res.ok) {
      const session = (await res.json()) as { access_token: string; token_type: string };
      const response = NextResponse.redirect(targetUrl);
      response.cookies.set("sales_agent_session", session.access_token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 8,
      });
      return response;
    }
  } catch (error) {
    console.error("Failed to auto-create dev session:", error);
  }

  return NextResponse.redirect(targetUrl);
}
