import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BusinessSetup } from "./business-setup";

vi.mock("./actions", () => ({ confirmBusinessProfile: vi.fn() }));

describe("BusinessSetup", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("guides the user from evidence to review and workflow choice", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          company_name: "Northstar",
          company_url: null,
          description: "We help companies modernize document collaboration securely.",
          services: ["SharePoint migration"],
          icp: {
            geographies: ["India"],
            industries: ["Professional services"],
            needs: ["Document modernization"],
          },
          target_customers: ["Mid-market companies"],
          facts: { services: "SharePoint migration" },
          exclusions: ["Unverified commitments"],
          pricing_policy: "Route every pricing question to a human owner.",
          qualification_questions: ["What problem are you solving?"],
          handoff_conditions: ["The prospect asks for pricing."],
          sources: [
            {
              label: "Business details supplied by user",
              kind: "user_input",
              content_hash: "a".repeat(64),
              excerpt: "We help companies modernize document collaboration securely.",
            },
          ],
          analysis_method: "gemini",
          warning: null,
          analysis_token: "synthetic-signed-analysis-token",
        }),
      }),
    );
    render(<BusinessSetup productName="Northstar" />);

    expect(screen.getByRole("heading", { name: "What does your company sell?" })).toBeVisible();
    fireEvent.change(screen.getByLabelText("Business description"), {
      target: { value: "We help companies modernize document collaboration securely." },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Analyze my business" }).closest("form")!);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Here is what we understood" })).toBeVisible();
    });
    expect(screen.getByText("AI generated")).toBeVisible();
    expect(screen.getByText("Find leads and call")).toBeVisible();
    expect(screen.getByText("Call my own leads")).toBeVisible();
    expect(screen.getByRole("button", { name: "Confirm profile and continue" })).toBeVisible();
  });
});
