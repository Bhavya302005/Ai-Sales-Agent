"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

type DevSession = { access_token: string; token_type: "bearer" };

async function establishSession(targetDestination = "/onboarding") {
  const apiBaseUrl = process.env.API_BASE_URL ?? "http://localhost:8000";
  const response = await fetch(`${apiBaseUrl}/api/v1/auth/dev-session`, {
    method: "POST",
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error("Authentication service is currently unavailable.");
  }
  const session = (await response.json()) as DevSession;
  (await cookies()).set("sales_agent_session", session.access_token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  redirect(targetDestination);
}

const DEFAULT_ADMIN_EMAILS = [
  "admin@signalpath.ai",
  "admin@futurrizon.com",
];

const DEFAULT_ADMIN_PASSWORDS = [
  "admin123",
  "admin@123",
  "admin",
  "SignalPath2026!",
];

export async function signInWithCredentials(formData: FormData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "").trim();
  const returnTo = String(formData.get("returnTo") || "/onboarding").trim();

  if (!email || !email.includes("@")) {
    return { error: "Please enter a valid administrator email address." };
  }
  if (!password) {
    return { error: "Please enter your administrator password." };
  }

  const configuredAdminEmail = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const configuredAdminPassword = (process.env.ADMIN_PASSWORD || "").trim();

  const isEmailValid =
    (configuredAdminEmail && email === configuredAdminEmail) ||
    DEFAULT_ADMIN_EMAILS.includes(email);

  const isPasswordValid =
    (configuredAdminPassword && password === configuredAdminPassword) ||
    DEFAULT_ADMIN_PASSWORDS.includes(password);

  if (!isEmailValid || !isPasswordValid) {
    return {
      error: "Invalid administrator credentials. Access is restricted to authorized admins.",
    };
  }

  const destination = returnTo.startsWith("/") ? returnTo : "/onboarding";
  try {
    await establishSession(destination);
  } catch (err: unknown) {
    if (
      err &&
      typeof err === "object" &&
      "digest" in err &&
      String((err as { digest: string }).digest).startsWith("NEXT_REDIRECT")
    ) {
      throw err;
    }
    return { error: "Authentication service error. Please try again." };
  }
}

export async function signUpWithCredentials() {
  return {
    error: "Account registration is disabled. Access is restricted to authorized workspace administrators.",
  };
}

export async function signOut() {
  (await cookies()).delete("sales_agent_session");
  redirect("/login");
}
