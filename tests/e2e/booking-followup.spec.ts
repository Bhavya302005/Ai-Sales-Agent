import { expect, test } from "@playwright/test";

test("operator sees honest Calendly and simulated-SMS readiness", async ({ page }) => {
  await page.goto("/login?returnTo=/settings/integrations");
  await page.locator("#auth-password").fill("admin123");
  await page.getByRole("button", { name: "Sign In as Admin" }).click();

  await expect(page).toHaveURL(/\/settings\/integrations$/);
  await expect(page.getByRole("heading", { name: "Integrations" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Calendly connected" })).toBeVisible();
  await expect(page.getByText(/SMS mode: mock \(simulated or disabled\)/)).toBeVisible();
});
