import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiHealth } from "./api-health";

describe("ApiHealth", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows verified API health", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: "ok", service: "api", version: "0.1.0" }),
      }),
    );

    render(await ApiHealth());
    expect(screen.getByRole("status")).toHaveTextContent("API ok · v0.1.0");
  });

  it("does not report a failed request as healthy", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    render(await ApiHealth());
    expect(screen.getByRole("status")).toHaveTextContent("API unavailable");
  });
});
