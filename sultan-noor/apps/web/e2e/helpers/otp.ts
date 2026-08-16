import { readFileSync } from "node:fs";
import { Page, expect } from "@playwright/test";

// In dev (no SMS_API_KEY/KAVENEGAR_OTP_TEMPLATE configured — see
// apps/api/src/auth/sms.provider.ts), OTP codes are only ever logged, never
// returned over the API, exactly like production would keep them private.
// E2E tests read that log file to complete the real OTP flow end to end
// instead of mocking auth away. Point API_LOG_PATH at the running API
// process's stdout log file.
const API_LOG_PATH = process.env.API_LOG_PATH;

function latestOtp(phone: string): string {
  if (!API_LOG_PATH) {
    throw new Error("API_LOG_PATH env var is not set — point it at the running API's log file to run OTP-based E2E tests.");
  }
  const log = readFileSync(API_LOG_PATH, "utf8");
  const matches = [...log.matchAll(new RegExp(`OTP for ${phone}: (\\d+)`, "g"))];
  const last = matches[matches.length - 1];
  if (!last) throw new Error(`No OTP found in log for ${phone}. Did the OTP request actually reach the API?`);
  return last[1];
}

export function randomPhone(): string {
  return `0912${String(Math.floor(1_000_000 + Math.random() * 8_999_999))}`;
}

// Drives the full login/register UI flow for a given phone number and
// returns once the app has redirected home as an authenticated user.
export async function loginViaOtp(page: Page, phone: string, fullName = "کاربر تست") {
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.fill('input[placeholder*="موبایل"]', phone);
  await page.click('button:has-text("دریافت کد تایید")');
  await expect(page.locator('input[placeholder="کد تایید"]')).toBeVisible({ timeout: 8000 });

  const otp = latestOtp(phone);
  await page.fill('input[placeholder="کد تایید"]', otp);
  // The name field only renders for a phone that isn't registered yet (see
  // GET /auth/user-exists) — an existing account (e.g. the seeded super
  // admin) skips straight to the code, so only fill it in if it's there.
  const nameField = page.locator('input[placeholder*="نام و نام خانوادگی"]');
  if (await nameField.isVisible().catch(() => false)) {
    await nameField.fill(fullName);
  }
  await page.click('button:has-text("تایید و ورود")');
  await page.waitForURL("/", { timeout: 8000 });
}
