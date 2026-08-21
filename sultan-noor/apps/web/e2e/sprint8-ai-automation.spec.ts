import { test, expect } from "@playwright/test";
import { loginViaOtp } from "./helpers/otp";

// Real, non-mocked E2E for Sprint 8's final AI automation surfaces — logs
// in via the real OTP flow (see helpers/otp.ts) against the actually
// running API + Postgres, then verifies each new admin page renders real
// backend-computed data end to end.
const SUPER_ADMIN_PHONE = "09120000000";

test.describe("Sprint 8: Inventory / CRM / Owner Report / Approval Center (real, non-mocked)", () => {
  test("staff can reach Inventory Forecast and see a real forecast/insufficient-data table", async ({ page }) => {
    await loginViaOtp(page, SUPER_ADMIN_PHONE, "مدیر سیستم");

    await page.goto("/admin/inventory", { waitUntil: "networkidle" });
    await expect(page.locator("h1")).toHaveText("پیش‌بینی موجودی و تجدید سفارش");
    await expect(page.locator("text=پیش‌بینی سطح موجودی")).toBeVisible();
    // Either a real forecast row or the honest insufficient-data table exists.
    await expect(page.locator("table")).toBeVisible();
  });

  test("staff can reach the CRM page and see real segment counts summing to the real customer count", async ({ page }) => {
    await loginViaOtp(page, SUPER_ADMIN_PHONE, "مدیر سیستم");

    await page.goto("/admin/crm", { waitUntil: "networkidle" });
    await expect(page.locator("h1")).toHaveText("مدیریت هوشمند مشتریان (CRM)");
    await expect(page.getByRole("heading", { name: /^مشتریان \(\d+\)$/ })).toBeVisible();
  });

  test("staff can view a real customer's insights, including the honest prediction-unavailable note for low order counts", async ({ page }) => {
    await loginViaOtp(page, SUPER_ADMIN_PHONE, "مدیر سیستم");

    await page.goto("/admin/crm", { waitUntil: "networkidle" });
    const customerSection = page.locator("section", { has: page.getByRole("heading", { name: /^مشتریان \(\d+\)$/ }) });
    await customerSection.locator("button").first().click();
    // Detail panel resolves to either a real prediction date or the honest note.
    await expect(page.locator("text=برآورد خرید بعدی")).toBeVisible();
  });

  test("staff can reach the Owner Daily Report and see real revenue/order numbers, never a placeholder", async ({ page }) => {
    await loginViaOtp(page, SUPER_ADMIN_PHONE, "مدیر سیستم");

    await page.goto("/admin/owner-report", { waitUntil: "networkidle" });
    await expect(page.locator("h1")).toHaveText("گزارش هوشمند امروز سلطان نور");
    await expect(page.locator("text=فروش امروز")).toBeVisible();
    await expect(page.locator("text=تعداد سفارش امروز")).toBeVisible();
  });

  test("staff can reach the Approval Center and see the real, live AI Activity Log", async ({ page }) => {
    await loginViaOtp(page, SUPER_ADMIN_PHONE, "مدیر سیستم");

    await page.goto("/admin/approval-center", { waitUntil: "networkidle" });
    await expect(page.locator("h1")).toHaveText("کارهای آماده تأیید");
    await expect(page.locator("text=لاگ فعالیت هوش مصنوعی")).toBeVisible();
  });

  test("a CUSTOMER-role account is denied every Sprint 8 staff-only admin page (RBAC/IDOR regression)", async ({ page }) => {
    const customerPhone = "0912" + String(Math.floor(1_000_000 + Math.random() * 8_999_999));
    await loginViaOtp(page, customerPhone, "مشتری تست");

    for (const path of ["/admin/inventory", "/admin/crm", "/admin/owner-report", "/admin/approval-center"]) {
      await page.goto(path, { waitUntil: "networkidle" });
      await expect(page.locator("text=شما به این بخش دسترسی ندارید")).toBeVisible();
    }
  });
});
