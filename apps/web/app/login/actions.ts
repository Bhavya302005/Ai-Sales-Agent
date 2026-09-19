"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

type DevSession = { access_token: string; token_type: "bearer" };

export async function enterDemoWorkspace() {
  const apiBaseUrl = process.env.API_BASE_URL ?? "http://localhost:8000";
  const response = await fetch(`${apiBaseUrl}/api/v1/auth/dev-session`, {
    method: "POST",
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Development sign-in is unavailable.");
  const session = (await response.json()) as DevSession;
  (await cookies()).set("sales_agent_session", session.access_token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  redirect("/leads");
}

export async function signOut() {
  (await cookies()).delete("sales_agent_session");
  redirect("/login");
}

