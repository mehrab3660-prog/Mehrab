"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/api";

const EMPTY_FORM = { companyName: "", contactName: "", phone: "", email: "", message: "" };

export default function ContactPage() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);
    try {
      const res = await api.post<{ message: string }>("/wholesale-leads", {
        ...form,
        email: form.email || undefined,
      });
      setResult({ type: "success", text: res.message });
      setForm(EMPTY_FORM);
    } catch (err) {
      setResult({ type: "error", text: err instanceof ApiError ? err.message : "ثبت درخواست با خطا مواجه شد." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-2xl font-extrabold">
        تماس <span className="gradient-text">با ما</span>
      </h1>
      <p className="mt-6 leading-8 text-foreground/75">
        اطلاعات تماس (تلفن، آدرس، شبکه‌های اجتماعی) به‌زودی در این صفحه تکمیل می‌شود. تا آن زمان می‌توانید از طریق
        دستیار خرید هوشمند در پایین صفحه سوالات خود را مطرح کنید.
      </p>

      <div className="mt-10 rounded-2xl surface-card p-4 sm:p-6">
        <h2 className="text-xl font-bold">درخواست همکاری عمده‌فروشی</h2>
        <p className="mt-2 text-sm text-foreground/60">
          نماینده‌ی فروشگاه، فروشنده یا شرکت هستید و به‌دنبال خرید عمده هستید؟ فرم زیر را پر کنید تا همکاران ما با شما
          تماس بگیرند.
        </p>

        <form onSubmit={handleSubmit} className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input
            required
            minLength={2}
            placeholder="نام شرکت / فروشگاه"
            value={form.companyName}
            onChange={(e) => setForm({ ...form, companyName: e.target.value })}
            className="min-h-11 rounded-lg border border-border-color bg-background px-3 py-2.5 text-sm focus:border-brand focus:outline-none"
          />
          <input
            required
            minLength={2}
            placeholder="نام و نام خانوادگی"
            value={form.contactName}
            onChange={(e) => setForm({ ...form, contactName: e.target.value })}
            className="min-h-11 rounded-lg border border-border-color bg-background px-3 py-2.5 text-sm focus:border-brand focus:outline-none"
          />
          <input
            required
            placeholder="شماره موبایل (مثال: 09123456789)"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            className="min-h-11 rounded-lg border border-border-color bg-background px-3 py-2.5 text-sm focus:border-brand focus:outline-none"
          />
          <input
            type="email"
            placeholder="ایمیل (اختیاری)"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="min-h-11 rounded-lg border border-border-color bg-background px-3 py-2.5 text-sm focus:border-brand focus:outline-none"
          />
          <textarea
            required
            minLength={10}
            rows={4}
            placeholder="چه محصولاتی و چه حجمی مد نظرتان است؟"
            value={form.message}
            onChange={(e) => setForm({ ...form, message: e.target.value })}
            className="col-span-full rounded-lg border border-border-color bg-background px-3 py-2.5 text-sm focus:border-brand focus:outline-none"
          />

          <button
            disabled={submitting}
            className="col-span-full rounded-xl bg-brand py-3 font-bold text-[#0b0e14] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "در حال ارسال..." : "ارسال درخواست"}
          </button>
        </form>

        {result && (
          <p className={`mt-4 text-sm ${result.type === "success" ? "text-green-500" : "text-red-400"}`}>{result.text}</p>
        )}
      </div>
    </div>
  );
}
