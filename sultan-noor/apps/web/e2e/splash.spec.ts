import { test, expect } from "@playwright/test";

test.describe("Splash intro", () => {
  // Override the suite-wide seeded "already seen" flag so this file's
  // fresh browser context actually encounters the overlay.
  test.use({ storageState: { cookies: [], origins: [] } });

  test("shows once on a fresh visit, dismisses into the real homepage, and never reappears on that browser", async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    const splash = page.getByRole("dialog", { name: "خوش‌آمدگویی سلطان نور" });
    await expect(splash.getByTestId("splash-enter-button")).toBeVisible();
    await expect(splash.getByRole("heading", { name: "سلطان نور", exact: true })).toBeVisible();

    await splash.getByTestId("splash-enter-button").click();
    await expect(page.getByTestId("splash-enter-button")).toBeHidden();

    await page.reload({ waitUntil: "networkidle" });
    await expect(page.getByTestId("splash-enter-button")).toHaveCount(0);
  });
});
