import { test, expect, BrowserContext } from "@playwright/test";
import { loginViaOtp, randomPhone } from "./helpers/otp";

// Real, non-mocked E2E for the homepage smart-home showroom — logs in via
// the real OTP flow against the actually running API + Postgres, exactly
// like the Sprint 8 suite.
const SUPER_ADMIN_PHONE = "09120000000";
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

async function readAccessToken(context: BrowserContext) {
  const storage = await context.storageState();
  return storage.origins[0].localStorage.find((i) => i.name === "sn_access_token")!.value;
}

test.describe("Homepage smart-home showroom", () => {
  test("homepage renders the showroom hero and floorplan images with no console/page errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto("/", { waitUntil: "networkidle" });
    await expect(page.locator("text=خانه هوشمند")).toBeVisible();
    await expect(page.locator('img[alt="نمای داخلی خانه هوشمند سلطان نور"]')).toBeVisible();

    expect(errors).toEqual([]);
  });

  test("a staff member can add a real-product hotspot and see it on the public API and homepage, then remove it", async ({ page, request }) => {
    await loginViaOtp(page, SUPER_ADMIN_PHONE, "مدیر سیستم");

    const productsRes = await request.get(`${API_URL}/products?take=1`);
    const { items } = await productsRes.json();
    test.skip(items.length === 0, "no seeded products to attach a hotspot to");
    const product = items[0];

    await page.goto("/admin/scene-hotspots", { waitUntil: "networkidle" });
    await expect(page.locator("h1")).toHaveText("نقاط تعاملی نمایشگر خانه هوشمند");

    await page.fill('input[placeholder*="لامپ پذیرایی"]', "نقطه تست");
    await page.selectOption("select", product.id);
    await page.click('button:has-text("افزودن نقطه تعاملی")');

    const row = page.locator("tr", { hasText: "نقطه تست" });
    await expect(row).toBeVisible();

    const hotspots = await (await request.get(`${API_URL}/scene/hotspots`)).json();
    expect(hotspots.some((h: { product: { id: string } }) => h.product.id === product.id)).toBe(true);

    await page.goto("/", { waitUntil: "networkidle" });
    const marker = page.locator(`button[aria-label*="${product.name}"]`);
    await expect(marker).toBeVisible();
    await marker.click();
    await expect(page.getByRole("link", { name: "مشاهده محصول", exact: true })).toBeVisible();

    await page.goto("/admin/scene-hotspots", { waitUntil: "networkidle" });
    await page.locator("tr", { hasText: "نقطه تست" }).locator('button:has-text("حذف")').click();
    await expect(page.locator("tr", { hasText: "نقطه تست" })).toHaveCount(0);
  });

  test("a fake product ID is rejected by the admin hotspot API (no-fake-products enforcement)", async ({ page, request }) => {
    await loginViaOtp(page, SUPER_ADMIN_PHONE, "مدیر سیستم");
    const token = await readAccessToken(page.context());

    const res = await request.post(`${API_URL}/scene/admin/hotspots`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { label: "جعلی", positionX: 50, positionY: 50, positionZ: 0, productId: "does-not-exist" },
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
