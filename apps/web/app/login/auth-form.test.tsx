import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthForm } from "./auth-form";
import { signInWithCredentials } from "./actions";

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

  it("does not render account creation tabs or signup fields", () => {
    render(<AuthForm />);

    expect(screen.queryByRole("tab", { name: /Create Account/i })).toBeNull();
    expect(screen.queryByLabelText("Full Name")).toBeNull();
    expect(screen.queryByLabelText("Company / Workspace")).toBeNull();
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
