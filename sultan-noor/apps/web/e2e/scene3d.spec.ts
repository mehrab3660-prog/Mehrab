import { test, expect, BrowserContext } from "@playwright/test";
import { loginViaOtp, randomPhone } from "./helpers/otp";

// Real, non-mocked E2E for Sprint 9's 3D homepage experience — logs in via
// the real OTP flow against the actually running API + Postgres, exactly
// like the Sprint 8 suite.
const SUPER_ADMIN_PHONE = "09120000000";
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

async function readAccessToken(context: BrowserContext) {
  const storage = await context.storageState();
  return storage.origins[0].localStorage.find((i) => i.name === "sn_access_token")!.value;
}

test.describe("Sprint 9: 3D homepage experience", () => {
  test("homepage renders the 3D section with no console/page errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto("/", { waitUntil: "networkidle" });
    await expect(page.locator("text=نمایشگر سه‌بعدی سلطان نور")).toBeVisible();
    // Give the IntersectionObserver-gated dynamic import time to mount.
    await page.waitForTimeout(2000);

    expect(errors).toEqual([]);
  });

  test("entering the house shows the interior promptly — regression test for the blank-canvas GLB-loading race", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto("/", { waitUntil: "networkidle" });
    await page.mouse.wheel(0, 700);
    const enterBtn = page.locator('button:has-text("ورود به خانه")');
    await enterBtn.waitFor({ state: "visible", timeout: 10000 });
    await enterBtn.click();

    // The exit button only renders once InteriorScene has actually mounted
    // inside the canvas — if furniture GLBs are still suspended and nothing
    // catches it, this (and everything else in the scene) never appears.
    await expect(page.locator('button:has-text("نمای بیرونی")')).toBeVisible({ timeout: 4000 });
    expect(errors).toEqual([]);
  });

  test("a staff member can add a real-product hotspot and see it on the public API, then remove it", async ({ page, request }) => {
    await loginViaOtp(page, SUPER_ADMIN_PHONE, "مدیر سیستم");

    const productsRes = await request.get(`${API_URL}/products?take=1`);
    const { items } = await productsRes.json();
    test.skip(items.length === 0, "no seeded products to attach a hotspot to");
    const product = items[0];

    await page.goto("/admin/scene-hotspots", { waitUntil: "networkidle" });
    await expect(page.locator("h1")).toHaveText("نقاط تعاملی نمایشگر سه‌بعدی");

    await page.fill('input[placeholder*="لامپ پذیرایی"]', "نقطه تست");
    await page.selectOption("select", product.id);
    await page.click('button:has-text("افزودن نقطه تعاملی")');

    const row = page.locator("tr", { hasText: "نقطه تست" });
    await expect(row).toBeVisible();

    const hotspots = await (await request.get(`${API_URL}/scene/hotspots`)).json();
    expect(hotspots.some((h: { product: { id: string } }) => h.product.id === product.id)).toBe(true);

    await row.locator('button:has-text("حذف")').click();
    await expect(row).toHaveCount(0);
  });

  test("a fake product ID is rejected by the admin hotspot API (no-fake-products enforcement)", async ({ page, request }) => {
    await loginViaOtp(page, SUPER_ADMIN_PHONE, "مدیر سیستم");
    const token = await readAccessToken(page.context());

    const res = await request.post(`${API_URL}/scene/admin/hotspots`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { label: "جعلی", positionX: 0, positionY: 0, positionZ: 0, productId: "does-not-exist" },
    });
    expect(res.status()).toBe(400);
  });

  test("a CUSTOMER-role account is denied the scene-hotspots admin page and API (RBAC/IDOR regression)", async ({ page, request }) => {
    await loginViaOtp(page, randomPhone(), "مشتری تست");

    await page.goto("/admin/scene-hotspots", { waitUntil: "networkidle" });
    await expect(page.locator("text=شما به این بخش دسترسی ندارید")).toBeVisible();

    const token = await readAccessToken(page.context());
    const res = await request.get(`${API_URL}/scene/admin/hotspots`, { headers: { Authorization: `Bearer ${token}` } });
    expect(res.status()).toBe(403);
  });
});
