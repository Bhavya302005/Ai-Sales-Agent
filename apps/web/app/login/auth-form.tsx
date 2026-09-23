"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { signInWithCredentials } from "./actions";

interface AuthFormProps {
  returnTo?: string;
}

export function AuthForm({ returnTo = "/onboarding" }: AuthFormProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    formData.set("returnTo", returnTo);

    startTransition(async () => {
      const res = await signInWithCredentials(formData);
      if (res?.error) {
        setError(res.error);
      }
    });
  }

  return (
    <div className="auth-card">
      <div className="auth-header">
        <Link className="auth-back-link" href="/">
          <svg fill="none" height="14" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="14">
            <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back to website
        </Link>

        <div className="auth-brand-row">
          <Link className="auth-brand-logo" href="/">
            Signal<span>Path</span>
          </Link>
        </div>

        <div className="auth-admin-badge">
          <span className="auth-badge-dot" />
          Admin Access Only
        </div>

        <h1 className="auth-heading">Administrator Sign In</h1>
        <p className="auth-subheading">
          Sign in with your workspace administrator credentials to access your sales workspace, leads, and live campaigns.
        </p>
      </div>

      {error ? (
        <div className="auth-error-alert" role="alert">
          <svg fill="none" height="15" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="15">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" x2="12" y1="8" y2="12" />
            <line x1="12" x2="12.01" y1="16" y2="16" />
          </svg>
          <span>{error}</span>
        </div>
      ) : null}

      <form className="auth-form" onSubmit={handleSubmit}>
        <input name="returnTo" type="hidden" value={returnTo} />

        <div className="auth-field">
          <label className="auth-label" htmlFor="auth-email">
            Admin Email
          </label>
          <input
            autoComplete="email"
            className="auth-input"
            defaultValue="admin@signalpath.ai"
            id="auth-email"
            name="email"
            placeholder="admin@signalpath.ai"
            required
            type="email"
          />
        </div>

        <div className="auth-field">
          <div className="auth-label-row">
            <label className="auth-label" htmlFor="auth-password">
              Password
            </label>
            <span className="auth-forgot-link">
              Admin CLI reset
            </span>
          </div>
          <div className="auth-input-wrapper">
            <input
              autoComplete="current-password"
              className="auth-input password-input"
              id="auth-password"
              name="password"
              placeholder="••••••••••••"
              required
              type={showPassword ? "text" : "password"}
            />
            <button
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="auth-password-toggle"
              onClick={() => setShowPassword(!showPassword)}
              type="button"
            >
              {showPassword ? (
                <svg fill="none" height="15" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="15">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                  <line x1="1" x2="23" y1="1" y2="23" />
                </svg>
              ) : (
                <svg fill="none" height="15" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="15">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>
        </div>

        <label className="auth-checkbox-label">
          <input defaultChecked type="checkbox" />
          <span>Remember session for 8 hours</span>
        </label>

        <button className="auth-submit-btn" disabled={isPending} type="submit">
          {isPending ? (
            <span className="auth-spinner" />
          ) : (
            <span>Sign In as Admin</span>
          )}
        </button>
      </form>

      <footer className="auth-footer">
        <p className="auth-fineprint">
          Public registration is disabled. Workspace access is restricted to authorized administrators.
        </p>
      </footer>
    </div>
  );
}
