import { test, expect } from "@playwright/test";
import { loginViaOtp, randomPhone } from "./helpers/otp";

test.describe("Authentication", () => {
  test("a new phone number can register via OTP and lands on an authenticated home page", async ({ page }) => {
    const phone = randomPhone();
    await loginViaOtp(page, phone, "کاربر آزمایشی");

    // account icon should now link to /orders instead of /login
    await expect(page.locator('a[aria-label="حساب کاربری"]')).toHaveAttribute("href", "/orders");
  });

  test("checkout redirects an anonymous visitor to /login", async ({ page }) => {
    await page.goto("/checkout");
    await page.waitForURL("/login");
  });

  test("wrong OTP code shows an error and does not log the user in", async ({ page }) => {
    const phone = randomPhone();
    await page.goto("/login", { waitUntil: "networkidle" });
    await page.fill('input[placeholder*="موبایل"]', phone);
    await page.click('button:has-text("دریافت کد تایید")');
    const firstDigit = page.locator('[data-testid="otp-digit-input"]').first();
    await expect(firstDigit).toBeVisible({ timeout: 8000 });

    await firstDigit.click();
    await page.keyboard.type("00000");
    await page.click('button:has-text("تایید و ورود")');

    await expect(page.locator("text=کد تایید نادرست است")).toBeVisible();
    expect(page.url()).toContain("/login");
  });
});
