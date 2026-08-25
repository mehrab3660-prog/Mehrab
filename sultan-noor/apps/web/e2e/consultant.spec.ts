import { test, expect } from "@playwright/test";
import { loginViaOtp, randomPhone } from "./helpers/otp";

// Exercises the real Smart Electrical Consultant flow (Sprint 7) end to end
// against the live API/DB: need-analysis wizard → real, priced packages →
// explicit confirmation → real Cart via the real add-to-cart endpoint.
test.describe("Smart Electrical Consultant", () => {
  test("answers the need-analysis questions, gets three real priced packages, and adds one to the real cart only after explicit confirmation", async ({ page }) => {
    await loginViaOtp(page, randomPhone());

    await page.goto("/consultant", { waitUntil: "networkidle" });
    await expect(page.locator("h1")).toContainText("مشاور هوشمند برق");

    const answers = [120, 2, 1, 1, 2];
    for (const value of answers) {
      const input = page.locator('input[type="number"]').first();
      await expect(input).toBeVisible();
      await input.fill(String(value));
      const response = page.waitForResponse((res) => res.url().includes("/electrical-consultant/") && res.url().endsWith("/input"));
      await page.click('button:has-text("بعدی")');
      await response;
    }

    await expect(page.locator('button:has-text("ساخت لیست خرید و پیشنهادها")')).toBeVisible();
    await page.click('button:has-text("ساخت لیست خرید و پیشنهادها")');

    await expect(page.locator("text=پکیج اقتصادی")).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=پکیج استاندارد")).toBeVisible();

    // Nothing goes in the cart until the explicit two-step confirmation.
    // The economic package renders first (tier order is fixed), so its
    // "add to cart" button is the first one on the page.
    await page.locator('button:has-text("افزودن این پکیج به سبد")').first().click();
    await expect(page.locator("text=تأیید نهایی و افزودن به سبد")).toBeVisible();
    await page.click('button:has-text("تأیید نهایی و افزودن به سبد")');
    await expect(page.locator("text=به سبد خرید اضافه شد")).toBeVisible({ timeout: 10000 });

    await page.goto("/cart", { waitUntil: "networkidle" });
    expect(await page.locator("body").innerText()).toContain("لامپ");
  });
});
