"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { api, ApiError } from "@/lib/api";

const RESEND_COOLDOWN_SECONDS = 120;

function LoginPageContent() {
  const { requestOtp, verifyOtp } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [fullName, setFullName] = useState("");
  const [isNewUser, setIsNewUser] = useState(false);
  // A shared referral link looks like /login?ref=ABC123 — prefill the code
  // so a new user doesn't have to type it in themselves, but still let them
  // edit or clear it.
  const [referralCode, setReferralCode] = useState(() => searchParams.get("ref")?.toUpperCase() ?? "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setInterval(() => setResendIn((s) => s - 1), 1000);
    return () => clearInterval(timer);
  }, [resendIn]);

  // A 429 here means the server already has a valid, unexpired code for this
  // phone (e.g. the user reloaded the page and re-submitted it) — that's not
  // a failure, it just means no new SMS should go out. Treat it the same as
  // a successful send instead of blocking the user or burning SMS credit.
  async function sendOtp() {
    const existsPromise = api
      .get<{ exists: boolean }>(`/auth/user-exists?phone=${encodeURIComponent(phone)}`)
      .then((r) => r.exists)
      .catch(() => true);

    try {
      await requestOtp(phone, "LOGIN");
      setResendIn(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setResendIn(err.retryAfterSeconds ?? RESEND_COOLDOWN_SECONDS);
        setError("کد قبلاً برای این شماره ارسال شده است، همان کد را وارد کنید.");
      } else {
        throw err;
      }
    }
    setIsNewUser(!(await existsPromise));
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
      await verifyOtp({
        phone,
        code,
        purpose: "LOGIN",
        fullName: fullName || undefined,
        referralCode: isNewUser && referralCode ? referralCode : undefined,
      });
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
              <input
                placeholder="کد معرف (اختیاری)"
                value={referralCode}
                onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                className="w-full rounded-lg border border-border-color bg-background px-3 py-2"
              />
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

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="px-4 py-24 text-center">در حال بارگذاری...</div>}>
      <LoginPageContent />
    </Suspense>
  );
}
