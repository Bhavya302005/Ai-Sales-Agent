import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthForm } from "./auth-form";
import { signInWithCredentials, signUpWithCredentials } from "./actions";

vi.mock("./actions", () => ({
  signInWithCredentials: vi.fn(),
  signUpWithCredentials: vi.fn(),
}));

describe("AuthForm (Admin Only)", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders Admin Sign In view with admin email and password inputs", () => {
    render(<AuthForm />);

    expect(screen.getByRole("heading", { name: /Administrator Sign In/i })).toBeDefined();
    expect(screen.getByText(/Admin Access Only/i)).toBeDefined();
    expect(screen.getByLabelText("Admin Email")).toBeDefined();
    expect(screen.getByLabelText("Password")).toBeDefined();
    expect(screen.getByRole("button", { name: /^Sign In as Admin$/i })).toBeDefined();
  });

  it("switches to a clean signup form", () => {
    render(<AuthForm />);

    fireEvent.click(screen.getByRole("button", { name: /Sign up here/i }));

    expect(screen.getByRole("heading", { name: /Create Workspace/i })).toBeDefined();
    expect(screen.getByText(/New Workspace/i)).toBeDefined();
    expect(screen.getByLabelText("Email Address")).toHaveValue("");
    expect(screen.getByLabelText("Password")).toHaveAttribute("autocomplete", "new-password");
  });

  it("can render directly in signup mode", () => {
    render(<AuthForm initialMode="signup" />);

    expect(screen.getByRole("heading", { name: /Create Workspace/i })).toBeDefined();
    expect(screen.getByLabelText("Email Address")).toHaveValue("");
    expect(screen.getByRole("button", { name: /^Sign Up$/i })).toBeDefined();
  });

  it("submits signup credentials to the signup action", () => {
    render(<AuthForm returnTo="/onboarding" />);

    fireEvent.click(screen.getByRole("button", { name: /Sign up here/i }));
    fireEvent.change(screen.getByLabelText("Email Address"), {
      target: { value: "new@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Sign Up$/i }));

    expect(signUpWithCredentials).toHaveBeenCalledTimes(1);
  });

  it("submits the form and calls signInWithCredentials", () => {
    render(<AuthForm returnTo="/admin" />);

    const emailInput = screen.getByLabelText("Admin Email");
    const passwordInput = screen.getByLabelText("Password");
    const submitBtn = screen.getByRole("button", { name: /^Sign In as Admin$/i });

    fireEvent.change(emailInput, { target: { value: "admin@signalpath.ai" } });
    fireEvent.change(passwordInput, { target: { value: "admin123" } });
    fireEvent.click(submitBtn);

    expect(signInWithCredentials).toHaveBeenCalledTimes(1);
  });

  it("never falls back to putting credentials in the URL before hydration", () => {
    render(<AuthForm />);

    expect(screen.getByRole("button", { name: /^Sign In as Admin$/i }).closest("form")).toHaveAttribute(
      "method",
      "post",
    );
  });
});
