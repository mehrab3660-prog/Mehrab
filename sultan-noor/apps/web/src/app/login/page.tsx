"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { api, ApiError } from "@/lib/api";

const RESEND_COOLDOWN_SECONDS = 120;

export default function LoginPage() {
  const { requestOtp, verifyOtp } = useAuth();
  const router = useRouter();

  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [fullName, setFullName] = useState("");
  const [customerType, setCustomerType] = useState<"RETAIL" | "WHOLESALE">("RETAIL");
  const [isNewUser, setIsNewUser] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setInterval(() => setResendIn((s) => s - 1), 1000);
    return () => clearInterval(timer);
  }, [resendIn]);

  async function sendOtp() {
    const [exists] = await Promise.all([
      api.get<{ exists: boolean }>(`/auth/user-exists?phone=${encodeURIComponent(phone)}`).then((r) => r.exists).catch(() => true),
      requestOtp(phone, "LOGIN"),
    ]);
    setIsNewUser(!exists);
    setResendIn(RESEND_COOLDOWN_SECONDS);
  }

  async function handleRequestOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await sendOtp();
      setStep("otp");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "خطایی رخ داد");
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setError(null);
    setLoading(true);
    try {
      await sendOtp();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "خطایی رخ داد");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await verifyOtp({ phone, code, purpose: "LOGIN", fullName: fullName || undefined, customerType });
      router.push("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "کد وارد شده نادرست است");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <h1 className="mb-6 text-center text-2xl font-bold">ورود / ثبت‌نام</h1>

      {step === "phone" ? (
        <form onSubmit={handleRequestOtp} className="space-y-4">
          <input
            required
            placeholder="شماره موبایل (مثال: 09123456789)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full rounded-lg border border-border-color bg-background px-3 py-2"
          />
          <button disabled={loading} className="w-full rounded-lg bg-brand py-2 font-bold text-[#0b0e14]">
            دریافت کد تایید
          </button>
        </form>
      ) : (
        <form onSubmit={handleVerifyOtp} className="space-y-4">
          <p className="text-sm text-foreground/60">کد تایید ارسال‌شده به {phone} را وارد کنید.</p>
          <input
            required
            placeholder="کد تایید"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="w-full rounded-lg border border-border-color bg-background px-3 py-2"
          />

          {isNewUser && (
            <>
              <input
                placeholder="نام و نام خانوادگی"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full rounded-lg border border-border-color bg-background px-3 py-2"
              />
              <div className="flex gap-4 text-sm">
                <label className="flex items-center gap-1">
                  <input
                    type="radio"
                    checked={customerType === "RETAIL"}
                    onChange={() => setCustomerType("RETAIL")}
                  />
                  مشتری عادی (B2C)
                </label>
                <label className="flex items-center gap-1">
                  <input
                    type="radio"
                    checked={customerType === "WHOLESALE"}
                    onChange={() => setCustomerType("WHOLESALE")}
                  />
                  مشتری عمده (B2B)
                </label>
              </div>
            </>
          )}

          <button disabled={loading} className="w-full rounded-lg bg-brand py-2 font-bold text-[#0b0e14]">
            تایید و ورود
          </button>

          <button
            type="button"
            onClick={handleResend}
            disabled={loading || resendIn > 0}
            className="w-full text-center text-sm text-foreground/60 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {resendIn > 0
              ? `ارسال دوباره کد (${Math.floor(resendIn / 60)}:${String(resendIn % 60).padStart(2, "0")})`
              : "ارسال دوباره کد"}
          </button>
        </form>
      )}

      {error && <p className="mt-4 text-center text-sm text-red-500">{error}</p>}
    </div>
  );
}
