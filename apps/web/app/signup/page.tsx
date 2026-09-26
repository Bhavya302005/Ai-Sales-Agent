import type { Metadata } from "next";

import { AuthForm } from "../login/auth-form";

export const metadata: Metadata = {
  title: "Create Workspace · SignalPath",
  description: "Create your SignalPath AI sales workspace.",
};

export default async function SignUpPage({
  searchParams,
}: {
  searchParams?: Promise<{ returnTo?: string }>;
}) {
  const resolved = searchParams ? await searchParams : {};
  const returnTo = resolved?.returnTo || "/onboarding";

  return (
    <main className="auth-shell">
      <AuthForm initialMode="signup" returnTo={returnTo} />
    </main>
  );
}
