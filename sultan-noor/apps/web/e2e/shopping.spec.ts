import { test, expect } from "@playwright/test";
import { loginViaOtp, randomPhone } from "./helpers/otp";

// Exercises the real purchase funnel against the live API: browse → product
// detail → add to cart → cart → checkout, stopping just short of the actual
// Zarinpal redirect (no real payment gateway to complete in a test run).
test.describe("Shopping flow", () => {
  test("browse, add to cart, and reach checkout with the item in the order summary", async ({ page }) => {
    await loginViaOtp(page, randomPhone());

    await page.goto("/products", { waitUntil: "networkidle" });
    const firstProductLink = page.locator('a[href^="/products/"]').first();
    await expect(firstProductLink).toBeVisible();
    await firstProductLink.click();
    await page.waitForURL(/\/products\/.+/);

    const productName = await page.locator("h1").first().textContent();
    await page.click('button:has-text("افزودن به سبد خرید")');
    await expect(page.locator("text=به سبد خرید اضافه شد")).toBeVisible();

    await page.goto("/cart", { waitUntil: "networkidle" });
    expect(await page.locator("body").innerText()).toContain(productName?.trim() ?? "");

    await page.click('button:has-text("ادامه فرآیند خرید")');
    await page.waitForURL("/checkout");
    // The order summary is rendered twice in the DOM (inline for mobile,
    // sidebar for desktop) and toggled with CSS — assert on whichever copy
    // is actually visible at the current viewport.
    await expect(page.locator("text=خلاصه سفارش >> visible=true")).toBeVisible();
    expect(await page.locator("body").innerText()).toContain(productName?.trim() ?? "");
  });

  test("wishlist toggle persists across a page reload", async ({ page }) => {
    await loginViaOtp(page, randomPhone());

    await page.goto("/products", { waitUntil: "networkidle" });
    const heart = page.locator('button[aria-label="افزودن به علاقه‌مندی‌ها"]').first();
    await heart.click();
    await expect(page.locator("text=به علاقه‌مندی‌ها اضافه شد")).toBeVisible();

    await page.reload({ waitUntil: "networkidle" });
    await page.goto("/wishlist", { waitUntil: "networkidle" });
    const emptyState = page.locator("text=فهرست علاقه‌مندی‌های شما خالی است");
    await expect(emptyState).toHaveCount(0);
  });
});
