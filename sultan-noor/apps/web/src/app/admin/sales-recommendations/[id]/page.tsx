"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { SalesRecommendation, SalesRecommendationType } from "@/lib/types";

const TYPE_LABEL: Record<SalesRecommendationType, string> = {
  CROSS_SELL: "فروش مرتبط",
  BUNDLE: "پک پیشنهادی",
  DISCOUNT: "تخفیف",
  CAMPAIGN: "کمپین",
  ABANDONED_CART: "سبد رهاشده",
};

const STATUS_LABEL: Record<SalesRecommendation["status"], string> = {
  PENDING_REVIEW: "در انتظار بررسی",
  APPROVED: "تأیید شده",
  REJECTED: "رد شده",
  ACTIVE: "فعال",
};

function toman(n: unknown): string {
  const num = Number(n);
  return Number.isFinite(num) ? `${Math.round(num).toLocaleString("fa-IR")} تومان` : "—";
}

export default function SalesRecommendationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { accessToken } = useAuth();
  const { toast } = useToast();
  const [rec, setRec] = useState<SalesRecommendation | null>(null);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  function load() {
    if (!accessToken || !id) return;
    api.get<SalesRecommendation>(`/sales/recommendations/${id}`, accessToken).then((r) => {
      setRec(r);
      setTitle(r.title);
      setReason(r.reason);
    });
  }

  useEffect(load, [accessToken, id]);

  async function handleSaveEdit() {
    setSaving(true);
    try {
      await api.patch(`/sales/recommendations/${id}`, { title, reason }, accessToken);
      toast("تغییرات ذخیره شد.", "success");
      setEditing(false);
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "ذخیره تغییرات با خطا مواجه شد.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleApprove() {
    setSaving(true);
    try {
      await api.post(`/sales/recommendations/${id}/approve`, undefined, accessToken);
      toast("پیشنهاد تأیید شد. هرگونه اقدام واقعی (قیمت، تخفیف، کمپین) باید دستی انجام شود.", "success");
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "تأیید پیشنهاد با خطا مواجه شد.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleActivate() {
    setSaving(true);
    try {
      await api.post(`/sales/recommendations/${id}/activate`, undefined, accessToken);
      toast("کمپین به‌عنوان فعال علامت‌گذاری شد.", "success");
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "فعال‌سازی کمپین با خطا مواجه شد.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleReject() {
    setSaving(true);
    try {
      await api.post(`/sales/recommendations/${id}/reject`, { reason: rejectReason || undefined }, accessToken);
      toast("پیشنهاد رد شد.", "success");
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "رد کردن پیشنهاد با خطا مواجه شد.", "error");
    } finally {
      setSaving(false);
    }
  }

  if (!rec) return <p className="text-sm text-foreground/50">در حال بارگذاری...</p>;

  const pending = rec.status === "PENDING_REVIEW";
  const canActivate = rec.type === "CAMPAIGN" && rec.status === "APPROVED";
  const payload = rec.payload ?? {};

  return (
    <div>
      <Link href="/admin/sales-recommendations" className="mb-4 inline-block text-sm text-brand hover:underline">
        ← بازگشت به پیشنهادهای فروش
      </Link>

      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-2xl font-bold">{rec.title}</h1>
        <span className="rounded bg-brand/10 px-2 py-0.5 text-xs text-brand">{STATUS_LABEL[rec.status]}</span>
      </div>
      <p className="mb-4 text-xs text-foreground/50">{TYPE_LABEL[rec.type]}</p>

      {editing ? (
        <div className="mb-4 space-y-3 rounded-lg border border-border-color p-4">
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded-lg border border-border-color bg-background px-3 py-2 text-sm" placeholder="عنوان" />
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={4} className="w-full rounded-lg border border-border-color bg-background px-3 py-2 text-sm" placeholder="دلیل" />
          <div className="flex gap-2">
            <button onClick={handleSaveEdit} disabled={saving} className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-[#0b0e14] disabled:opacity-50">
              ذخیره ویرایش
            </button>
            <button onClick={() => setEditing(false)} className="rounded-lg border border-border-color px-4 py-2 text-sm">
              انصراف
            </button>
          </div>
        </div>
      ) : (
        <div className="mb-4 space-y-4 rounded-lg border border-border-color p-4 text-sm leading-7">
          <div>
            <p className="mb-1 text-xs font-bold text-foreground/50">دلیل (بر اساس داده واقعی)</p>
            <p className="whitespace-pre-line">{rec.reason}</p>
          </div>

          {rec.type === "DISCOUNT" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs text-foreground/50">قیمت فعلی</p>
                <p className="font-bold">{toman(payload.currentPrice)}</p>
              </div>
              <div>
                <p className="text-xs text-foreground/50">تخفیف پیشنهادی</p>
                <p className="font-bold">{String(payload.discountPercent ?? "—")}٪</p>
              </div>
              <div>
                <p className="text-xs text-foreground/50">قیمت نهایی پیشنهادی</p>
                <p className="font-bold">{toman(payload.suggestedFinalPrice)}</p>
              </div>
              <div>
                <p className="text-xs text-foreground/50">مدت پیشنهادی</p>
                <p className="font-bold">{payload.suggestedDurationDays ? `${payload.suggestedDurationDays} روز` : "—"}</p>
              </div>
              {typeof payload.risk === "string" && (
                <div className="sm:col-span-2">
                  <p className="text-xs text-foreground/50">ریسک احتمالی</p>
                  <p>{payload.risk}</p>
                </div>
              )}
            </div>
          )}

          {rec.type === "CAMPAIGN" && (
            <div className="space-y-2">
              {typeof payload.goal === "string" && (
                <p>
                  <span className="text-xs text-foreground/50">هدف: </span>
                  {payload.goal}
                </p>
              )}
              {typeof payload.audience === "string" && (
                <p>
                  <span className="text-xs text-foreground/50">مخاطب: </span>
                  {payload.audience}
                </p>
              )}
              {typeof payload.adCopy === "string" && (
                <p>
                  <span className="text-xs text-foreground/50">متن تبلیغاتی: </span>
                  {payload.adCopy}
                </p>
              )}
              {payload.suggestedDiscountPercent != null && (
                <p>
                  <span className="text-xs text-foreground/50">تخفیف پیشنهادی: </span>
                  {String(payload.suggestedDiscountPercent)}٪
                </p>
              )}
              {payload.suggestedDurationDays != null && (
                <p>
                  <span className="text-xs text-foreground/50">مدت پیشنهادی: </span>
                  {String(payload.suggestedDurationDays)} روز
                </p>
              )}
            </div>
          )}

          {rec.confidenceNote && (
            <div className="rounded-lg border border-dashed border-amber-500/50 bg-amber-500/5 p-3 text-xs text-amber-500">{rec.confidenceNote}</div>
          )}

          {rec.sources && rec.sources.length > 0 && <p className="text-xs text-foreground/50">منبع: {rec.sources.join("، ")}</p>}
        </div>
      )}

      {pending && !editing && (
        <div className="flex flex-wrap gap-2">
          <button onClick={handleApprove} disabled={saving} className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-[#0b0e14] disabled:opacity-50">
            تأیید
          </button>
          <button onClick={() => setEditing(true)} className="rounded-lg border border-border-color px-4 py-2 text-sm">
            ویرایش
          </button>
          <div className="flex items-center gap-2">
            <input
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="دلیل رد (اختیاری)"
              className="rounded-lg border border-border-color bg-background px-3 py-2 text-sm"
            />
            <button onClick={handleReject} disabled={saving} className="rounded-lg border border-red-500/40 px-4 py-2 text-sm text-red-500 disabled:opacity-50">
              رد
            </button>
          </div>
        </div>
      )}

      {canActivate && (
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={handleActivate} disabled={saving} className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-[#0b0e14] disabled:opacity-50">
            فعال‌سازی کمپین
          </button>
          <p className="text-xs text-foreground/50">فعال‌سازی فقط این کمپین را به‌عنوان ابتکار جاری شما علامت می‌زند — هیچ سیستم ارسال خودکاری اجرا نمی‌شود.</p>
        </div>
      )}

      {rec.status === "REJECTED" && rec.rejectionReason && <p className="text-sm text-red-500">دلیل رد: {rec.rejectionReason}</p>}
      {rec.status === "ACTIVE" && <p className="text-sm text-green-500">این کمپین هم‌اکنون به‌عنوان ابتکار فعال شما علامت‌گذاری شده است.</p>}
    </div>
  );
}
