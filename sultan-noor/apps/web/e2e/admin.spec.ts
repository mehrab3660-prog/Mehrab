import { test, expect } from "@playwright/test";
import { loginViaOtp } from "./helpers/otp";

// Uses the seeded SUPER_ADMIN account (see apps/api/prisma/seed.ts) —
// 09120000000 always exists with that role in a freshly-seeded database.
const SUPER_ADMIN_PHONE = "09120000000";

test.describe("Admin panel", () => {
  test("a staff member can create and then delete a brand end to end", async ({ page }) => {
    await loginViaOtp(page, SUPER_ADMIN_PHONE, "مدیر سیستم");

    await page.goto("/admin/brands", { waitUntil: "networkidle" });
    await expect(page.locator("h1")).toHaveText("برندها");

    const brandName = `برند تست ${Date.now()}`;
    await page.fill('input[placeholder="نام برند"]', brandName);
    await page.fill('input[placeholder="اسلاگ"]', `test-brand-${Date.now()}`);
    await page.click('button:has-text("افزودن")');

    const row = page.locator("li", { hasText: brandName });
    await expect(row).toBeVisible();

    await row.locator('button:has-text("حذف")').click();
    await expect(row).toHaveCount(0);
  });

  test("an anonymous visitor is denied access to the admin panel", async ({ page }) => {
    // Each Playwright test gets its own fresh, isolated browser context, so
    // this page has never authenticated (auth state lives in localStorage).
    await page.goto("/admin");
    await expect(page.locator("text=شما به این بخش دسترسی ندارید")).toBeVisible();
  });
});
