"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { ConsultantTier, ConsultationStepResponse, ElectricalConsultation, GeneratePackagesResponse } from "@/lib/types";

const TIER_LABEL: Record<ConsultantTier, string> = { ECONOMIC: "اقتصادی", STANDARD: "استاندارد", PROFESSIONAL: "حرفه‌ای" };
const STATUS_LABEL: Record<string, string> = { COLLECTING_INFO: "در حال تکمیل اطلاعات", READY: "آماده بررسی", CART_ADDED: "افزوده‌شده به سبد" };

function formatToman(value: number) {
  return `${value.toLocaleString("fa-IR")} تومان`;
}

export default function ConsultantPage() {
  const { user, accessToken } = useAuth();
  const { toast } = useToast();

  const [step, setStep] = useState<ConsultationStepResponse | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [refining, setRefining] = useState(false);
  const [otherRooms, setOtherRooms] = useState("");
  const [hasStaircase, setHasStaircase] = useState(false);
  const [preferences, setPreferences] = useState("");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<GeneratePackagesResponse | null>(null);
  const [confirmingTier, setConfirmingTier] = useState<ConsultantTier | null>(null);
  const [addingToCart, setAddingToCart] = useState(false);
  const [history, setHistory] = useState<ElectricalConsultation[] | null>(null);

  async function startConsultation() {
    try {
      const res = await api.post<ConsultationStepResponse>("/electrical-consultant/start", undefined, accessToken);
      setStep(res);
      setResult(null);
      setConfirmingTier(null);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "شروع مشاوره با خطا مواجه شد.", "error");
    }
  }

  useEffect(() => {
    startConsultation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function loadHistory() {
    if (!accessToken) return;
    api.get<ElectricalConsultation[]>("/electrical-consultant/mine", accessToken).then(setHistory);
  }
  useEffect(loadHistory, [accessToken]);

  async function submitCurrentField() {
    if (!step || !inputValue.trim()) return;
    const field = step.missingFields[0];
    try {
      const res = await api.patch<ConsultationStepResponse>(
        `/electrical-consultant/${step.consultation.id}/input`,
        { [field]: Number(inputValue) },
        accessToken,
      );
      setStep(res);
      setInputValue("");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "ثبت پاسخ با خطا مواجه شد.", "error");
    }
  }

  async function handleGenerate() {
    if (!step) return;
    setGenerating(true);
    try {
      if (otherRooms || hasStaircase) {
        const res = await api.patch<ConsultationStepResponse>(
          `/electrical-consultant/${step.consultation.id}/input`,
          { otherRooms: otherRooms ? Number(otherRooms) : undefined, hasStaircase },
          accessToken,
        );
        setStep(res);
      }
      if (preferences.trim()) {
        const prefRes = await api.post<ConsultationStepResponse>(`/electrical-consultant/${step.consultation.id}/preferences`, { text: preferences }, accessToken);
        if (prefRes.requestedBrandName && !prefRes.brandRecognized) {
          toast(`برند «${prefRes.requestedBrandName}» در کاتالوگ سلطان نور پیدا نشد؛ پیشنهادها بدون این فیلتر ساخته می‌شوند.`, "info");
        }
      }
      const generated = await api.post<GeneratePackagesResponse>(`/electrical-consultant/${step.consultation.id}/generate`, undefined, accessToken);
      setResult(generated);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "ساخت لیست خرید با خطا مواجه شد.", "error");
    } finally {
      setGenerating(false);
    }
  }

  async function confirmAddToCart(tier: ConsultantTier) {
    if (!step) return;
    if (!user) {
      toast("برای افزودن به سبد خرید ابتدا وارد شوید.", "info");
      return;
    }
    setAddingToCart(true);
    try {
      await api.post(`/electrical-consultant/${step.consultation.id}/add-to-cart`, { tier }, accessToken);
      toast("محصولات این پکیج به سبد خرید اضافه شد.", "success");
      setConfirmingTier(null);
      loadHistory();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "افزودن به سبد با خطا مواجه شد.", "error");
    } finally {
      setAddingToCart(false);
    }
  }

  async function openHistoryItem(id: string) {
    try {
      const res = await api.get<ConsultationStepResponse>(`/electrical-consultant/${id}`, accessToken);
      setStep(res);
      setConfirmingTier(null);
      const c = res.consultation;
      if (c.packagesJson) {
        setResult({ consultation: c, packages: c.packagesJson, noMatchItemKeys: c.noMatchItemKeysJson ?? [], safetyDisclaimer: "" });
      } else {
        setResult(null);
      }
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "بارگذاری مشاوره قبلی با خطا مواجه شد.", "error");
    }
  }

  if (!step) return <div className="mx-auto max-w-3xl px-4 py-16 text-center text-sm text-foreground/50">در حال بارگذاری...</div>;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="mb-2 text-2xl font-bold">مشاور هوشمند برق ساختمان</h1>
      <p className="mb-8 text-sm text-foreground/60">
        نیاز خود را بگویید تا بر اساس محصولات واقعی موجود در سلطان نور، یک لیست خرید کامل با سه سطح پیشنهادی برایتان بسازیم.
      </p>

      {history && history.length > 0 && !result && (
        <div className="mb-8 rounded-lg border border-border-color p-4">
          <h2 className="mb-2 text-sm font-bold">مشاوره‌های قبلی من</h2>
          <div className="flex flex-wrap gap-2">
            {history.map((h) => (
              <button
                key={h.id}
                onClick={() => openHistoryItem(h.id)}
                className="rounded-full border border-border-color px-3 py-1 text-xs hover:border-brand"
              >
                {new Date(h.createdAt).toLocaleDateString("fa-IR")} — {STATUS_LABEL[h.status]}
              </button>
            ))}
          </div>
        </div>
      )}

      {!result && !step.readyToGenerate && (
        <div className="rounded-lg border border-border-color p-6">
          <p className="mb-4 text-lg font-bold">{step.nextQuestion}</p>
          <div className="flex gap-2">
            <input
              type="number"
              min={0}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitCurrentField()}
              className="w-40 rounded-lg border border-border-color bg-background px-3 py-2 text-sm"
              autoFocus
            />
            <button onClick={submitCurrentField} className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-[#0b0e14]">
              بعدی
            </button>
          </div>
        </div>
      )}

      {!result && step.readyToGenerate && (
        <div className="space-y-4 rounded-lg border border-border-color p-6">
          <p className="text-sm text-foreground/70">
            اطلاعات پایه کامل شد. اگر می‌خواهید، جزئیات بیشتری هم بدهید — یا مستقیم به ساخت پیشنهاد بروید.
          </p>
          {!refining ? (
            <button onClick={() => setRefining(true)} className="text-sm text-brand hover:underline">
              + افزودن جزئیات بیشتر (فضاهای دیگر، راه‌پله، ترجیحات)
            </button>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-foreground/60">
                تعداد فضاهای دیگر (راهرو، انباری و...)
                <input
                  type="number"
                  min={0}
                  value={otherRooms}
                  onChange={(e) => setOtherRooms(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border-color bg-background px-3 py-2 text-sm"
                />
              </label>
              <label className="mt-1 flex items-center gap-2 text-xs text-foreground/60">
                <input type="checkbox" checked={hasStaircase} onChange={(e) => setHasStaircase(e.target.checked)} />
                واحد راه‌پله (کلید راه‌پله) دارد
              </label>
              <label className="text-xs text-foreground/60 sm:col-span-2">
                ترجیحات شما (مثلاً: «ارزان‌ترین گزینه را می‌خواهم»، «فقط برند سلطان نور»، «کیفیت بالاتر می‌خواهم»)
                <textarea
                  value={preferences}
                  onChange={(e) => setPreferences(e.target.value)}
                  rows={2}
                  className="mt-1 w-full rounded-lg border border-border-color bg-background px-3 py-2 text-sm"
                />
              </label>
            </div>
          )}
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-[#0b0e14] disabled:opacity-50"
          >
            {generating ? "در حال ساخت لیست خرید..." : "ساخت لیست خرید و پیشنهادها"}
          </button>
        </div>
      )}

      {result && (
        <div>
          <button
            onClick={() => {
              setResult(null);
              startConsultation();
            }}
            className="mb-4 text-sm text-brand hover:underline"
          >
            ← شروع مشاوره جدید
          </button>

          {result.safetyDisclaimer && (
            <p className="mb-4 rounded-lg border border-dashed border-amber-500/50 bg-amber-500/5 p-3 text-xs text-amber-500">
              {result.safetyDisclaimer}
            </p>
          )}

          {result.noMatchItemKeys.length > 0 && (
            <p className="mb-4 rounded-lg border border-dashed border-border-color bg-surface p-3 text-xs text-foreground/50">
              برای برخی از اقلام ({result.noMatchItemKeys.length} مورد) در حال حاضر محصول واقعی کافی در کاتالوگ سلطان نور تعریف نشده — این موارد در پیشنهاد نیامده‌اند.
            </p>
          )}

          {Object.keys(result.packages).length === 0 ? (
            <p className="text-sm text-foreground/60">برای این نیاز، در حال حاضر محصول کافی در کاتالوگ سلطان نور پیدا نشد.</p>
          ) : (
            <div className="grid gap-4 lg:grid-cols-3">
              {(Object.keys(result.packages) as ConsultantTier[]).map((tier) => {
                const pkg = result.packages[tier]!;
                return (
                  <div key={tier} className="flex flex-col rounded-lg border border-border-color p-4">
                    <h3 className="mb-3 text-lg font-bold text-brand">پکیج {TIER_LABEL[tier]}</h3>
                    <div className="flex-1 space-y-1.5 text-sm">
                      {pkg.lines.map((line, i) => (
                        <div key={i} className="flex items-center justify-between gap-2 border-b border-border-color/50 py-1.5">
                          <div className="min-w-0">
                            <Link href={`/products/${line.slug}`} className="line-clamp-1 hover:text-brand">
                              {line.productName}
                            </Link>
                            <p className="text-[10px] text-foreground/40">
                              {line.label} × {line.quantity.toLocaleString("fa-IR")}
                              {line.quantity < line.requestedQuantity && ` (کاهش‌یافته از ${line.requestedQuantity})`}
                            </p>
                          </div>
                          <span className="shrink-0 text-xs font-bold">{formatToman(line.lineTotal)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 flex items-center justify-between border-t border-border-color pt-3">
                      <span className="text-sm font-bold">جمع کل</span>
                      <span className="text-lg font-extrabold text-brand">{formatToman(pkg.total)}</span>
                    </div>

                    {confirmingTier === tier ? (
                      <div className="mt-3 space-y-2 rounded-lg border border-brand/40 bg-brand/5 p-3">
                        <p className="text-xs">
                          با تأیید، {pkg.lines.length} قلم محصول واقعی به سبد خرید شما اضافه می‌شود.
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => confirmAddToCart(tier)}
                            disabled={addingToCart}
                            className="flex-1 rounded-lg bg-brand px-3 py-2 text-xs font-bold text-[#0b0e14] disabled:opacity-50"
                          >
                            {addingToCart ? "در حال افزودن..." : "تأیید نهایی و افزودن به سبد"}
                          </button>
                          <button onClick={() => setConfirmingTier(null)} className="rounded-lg border border-border-color px-3 py-2 text-xs">
                            انصراف
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmingTier(tier)}
                        className="mt-3 rounded-lg border border-brand px-3 py-2 text-sm font-bold text-brand hover:bg-brand/10"
                      >
                        افزودن این پکیج به سبد
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
