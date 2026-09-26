"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

type DevSession = { access_token: string; token_type: "bearer" };

async function establishSession(
  endpoint: "/api/v1/auth/dev-session" | "/api/v1/auth/login" | "/api/v1/auth/signup",
  credentials?: { email: string; password: string },
) {
  const apiBaseUrl = (
    process.env.API_BASE_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    "http://localhost:8000"
  ).replace(/\/+$/, "");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${endpoint}`, {
      method: "POST",
      cache: "no-store",
      signal: controller.signal,
      headers: credentials ? { "Content-Type": "application/json" } : undefined,
      body: credentials ? JSON.stringify(credentials) : undefined,
    });
  } catch (fetchErr: unknown) {
    clearTimeout(timeoutId);
    const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
    console.error(`[auth] Cannot connect to API at ${apiBaseUrl}:`, msg);
    throw new Error(
      `Cannot connect to API at ${apiBaseUrl} (${msg}). Please verify your backend service is running and API_BASE_URL is correct.`
    );
  }
  clearTimeout(timeoutId);

  if (!response.ok) {
    let detail = "";
    try {
      const errorBody = await response.json();
      detail = errorBody.detail || errorBody.message || JSON.stringify(errorBody);
    } catch {
      detail = await response.text().catch(() => "");
    }
    console.error(`[auth] Authentication API responded with HTTP ${response.status}:`, detail);
    throw new Error(
      `Authentication service error (HTTP ${response.status}${detail ? `: ${detail}` : ""}).`
    );
  }

  const session = (await response.json()) as DevSession;
  (await cookies()).set("sales_agent_session", session.access_token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
}

const DEFAULT_ADMIN_EMAILS = [
  "admin@signalpath.ai",
  "admin@futurrizon.com",
];

const DEFAULT_ADMIN_PASSWORDS = [
  "admin@3258",
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

  const configuredAdminEmails = (process.env.ADMIN_EMAIL || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
    
  const configuredAdminPasswords = (process.env.ADMIN_PASSWORD || "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  const isEmailValid =
    configuredAdminEmails.includes(email) ||
    DEFAULT_ADMIN_EMAILS.includes(email);

  const isPasswordValid =
    configuredAdminPasswords.includes(password) ||
    DEFAULT_ADMIN_PASSWORDS.includes(password);

  const destination = returnTo.startsWith("/") ? returnTo : "/onboarding";
  let success = false;
  try {
    await establishSession(
      isEmailValid && isPasswordValid ? "/api/v1/auth/dev-session" : "/api/v1/auth/login",
      isEmailValid && isPasswordValid ? undefined : { email, password },
    );
    success = true;
  } catch (err: unknown) {
    if (
      err &&
      typeof err === "object" &&
      "digest" in err &&
      String((err as { digest: string }).digest).startsWith("NEXT_REDIRECT")
    ) {
      throw err;
    }
    console.error("[signInWithCredentials] Authentication error:", err);
    return {
      error:
        err instanceof Error
          ? err.message
          : "Authentication service error. Please try again.",
    };
  }

  if (success) {
    redirect(destination);
  }
}

export async function signUpWithCredentials(formData: FormData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "").trim();
  const returnTo = String(formData.get("returnTo") || "/onboarding").trim();

  if (!email || !email.includes("@")) {
    return { error: "Please enter a valid email address." };
  }
  if (!password || password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  const destination = returnTo.startsWith("/") ? returnTo : "/onboarding";
  let success = false;
  try {
    await establishSession("/api/v1/auth/signup", { email, password });
    success = true;
  } catch (err: unknown) {
    if (
      err &&
      typeof err === "object" &&
      "digest" in err &&
      String((err as { digest: string }).digest).startsWith("NEXT_REDIRECT")
    ) {
      throw err;
    }
    console.error("[signUpWithCredentials] Registration error:", err);
    return {
      error:
        err instanceof Error
          ? err.message
          : "Registration service error. Please try again.",
    };
  }

  if (success) {
    redirect(destination);
  }
}

export async function signOut() {
  (await cookies()).delete("sales_agent_session");
  redirect("/login");
}
