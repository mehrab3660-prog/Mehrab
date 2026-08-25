"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { useAuth } from "@/context/AuthContext";
import { api, ApiError } from "@/lib/api";
import { easeOut } from "@/lib/motion";

const RESEND_COOLDOWN_SECONDS = 120;
const OTP_LENGTH = 5;

// Masks a phone for display without hiding which number the SMS actually
// went to, e.g. 09123456789 -> 0912•••6789.
function maskPhone(phone: string) {
  if (phone.length < 8) return phone;
  return `${phone.slice(0, 4)}•••${phone.slice(-4)}`;
}

// A row of individually-boxed digit inputs bound to the same `code` string
// as a plain text field would be — auto-advances on type, steps back on
// backspace, and accepts a full pasted code in one go.
function OtpDigitInput({ value, onChange, autoFocus }: { value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length: OTP_LENGTH }, (_, i) => value[i] ?? "");

  function setDigit(index: number, digit: string) {
    const next = digits.slice();
    next[index] = digit;
    onChange(next.join("").slice(0, OTP_LENGTH));
  }

  function handleChange(index: number, raw: string) {
    const digit = raw.replace(/\D/g, "").slice(-1);
    setDigit(index, digit);
    if (digit && index < OTP_LENGTH - 1) inputRefs.current[index + 1]?.focus();
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, OTP_LENGTH);
    if (!pasted) return;
    e.preventDefault();
    onChange(pasted);
    inputRefs.current[Math.min(pasted.length, OTP_LENGTH - 1)]?.focus();
  }

  const center = (OTP_LENGTH - 1) / 2;

  return (
    <div dir="ltr" className="flex justify-center gap-2 sm:gap-3">
      {digits.map((digit, i) => (
        <motion.input
          key={i}
          ref={(el: HTMLInputElement | null) => {
            inputRefs.current[i] = el;
          }}
          // Boxes deal in like a fanned hand of cards — each one starts
          // tilted away from center and settles flat, staggered left to
          // right — then behave as plain boxes once settled.
          initial={{ opacity: 0, y: 18, rotate: (i - center) * 7, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, rotate: 0, scale: 1 }}
          transition={{ duration: 0.45, delay: i * 0.07, ease: easeOut }}
          autoFocus={autoFocus && i === 0}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={1}
          data-testid="otp-digit-input"
          aria-label={`رقم ${i + 1} کد تایید`}
          value={digit}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          className="h-14 w-12 rounded-xl border border-border-color bg-background text-center text-xl font-bold text-foreground shadow-inner outline-none transition-colors focus:border-brand focus:shadow-[0_0_0_3px_rgba(245,184,46,0.25)] sm:h-16 sm:w-14"
        />
      ))}
    </div>
  );
}

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
        <form onSubmit={handleVerifyOtp} className="space-y-5 rounded-2xl border border-border-color bg-surface p-6 shadow-lg">
          <div className="text-center">
            <h2 className="text-lg font-bold">کد تایید را وارد کنید</h2>
            <p className="mt-1 text-sm text-foreground/60">
              یک کد {OTP_LENGTH} رقمی به شماره‌ی <span className="font-bold text-foreground">{maskPhone(phone)}</span> پیامک شد.
            </p>
          </div>

          <OtpDigitInput value={code} onChange={setCode} autoFocus />

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
