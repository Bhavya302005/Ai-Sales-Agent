import type { Metadata } from "next";

import { AuthForm } from "./auth-form";

export const metadata: Metadata = {
  title: "Sign In · SignalPath",
  description: "Sign in to manage your AI sales workspace.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ returnTo?: string }>;
}) {
  const resolved = searchParams ? await searchParams : {};
  const returnTo = resolved?.returnTo || "/onboarding";

  return (
    <main className="auth-shell">
      <AuthForm returnTo={returnTo} />
    </main>
  );
}
