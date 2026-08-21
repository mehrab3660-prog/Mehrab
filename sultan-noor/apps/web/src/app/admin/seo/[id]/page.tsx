"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { Product, ProductSeoSuggestion } from "@/lib/types";

const STATUS_LABEL: Record<ProductSeoSuggestion["status"], string> = {
  PENDING_REVIEW: "در انتظار بررسی",
  APPROVED: "تأیید شده",
  REJECTED: "رد شده",
};

export default function SeoSuggestionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { accessToken } = useAuth();
  const { toast } = useToast();
  const [suggestion, setSuggestion] = useState<ProductSeoSuggestion | null>(null);
  const [product, setProduct] = useState<Product | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<ProductSeoSuggestion>>({});
  const [saving, setSaving] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  function load() {
    if (!accessToken || !id) return;
    api.get<ProductSeoSuggestion>(`/seo/suggestions/${id}`, accessToken).then((s) => {
      setSuggestion(s);
      setForm(s);
      api.get<Product>(`/products/${s.productId}`, accessToken).then(setProduct).catch(() => setProduct(null));
    });
  }

  useEffect(load, [accessToken, id]);

  async function handleSaveEdit() {
    setSaving(true);
    try {
      await api.patch(
        `/seo/suggestions/${id}`,
        {
          metaTitle: form.metaTitle || undefined,
          metaDescription: form.metaDescription || undefined,
          searchKeywords: form.searchKeywords || undefined,
          descriptionSuggestion: form.descriptionSuggestion || undefined,
        },
        accessToken,
      );
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
      await api.post(`/seo/suggestions/${id}/approve`, undefined, accessToken);
      toast("پیشنهاد سئو تأیید و روی محصول اعمال شد.", "success");
      router.push("/admin/seo");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "تأیید پیشنهاد با خطا مواجه شد.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleReject() {
    setSaving(true);
    try {
      await api.post(`/seo/suggestions/${id}/reject`, { reason: rejectReason || undefined }, accessToken);
      toast("پیشنهاد رد شد.", "success");
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "رد کردن پیشنهاد با خطا مواجه شد.", "error");
    } finally {
      setSaving(false);
    }
  }

  if (!suggestion) return <p className="text-sm text-foreground/50">در حال بارگذاری...</p>;

  const pending = suggestion.status === "PENDING_REVIEW";
  const imageNameById = new Map((product?.images ?? []).map((img) => [img.id, img]));

  return (
    <div>
      <Link href="/admin/seo" className="mb-4 inline-block text-sm text-brand hover:underline">
        ← بازگشت به سئو خودکار
      </Link>

      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">{product?.name ?? "پیشنهاد سئو"}</h1>
        <span
          className={`rounded px-2 py-0.5 text-xs ${
            suggestion.status === "PENDING_REVIEW" ? "bg-brand/10 text-brand" : suggestion.status === "APPROVED" ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"
          }`}
        >
          {STATUS_LABEL[suggestion.status]}
        </span>
      </div>

      {suggestion.confidenceNote && (
        <div className="mb-4 rounded-lg border border-dashed border-amber-500/50 bg-amber-500/5 p-3 text-sm text-amber-500">
          <strong>نکته‌ی هوش مصنوعی برای بررسی شما: </strong>
          {suggestion.confidenceNote}
        </div>
      )}

      {suggestion.sources && suggestion.sources.length > 0 && (
        <p className="mb-4 text-xs text-foreground/50">منبع اطلاعات: {suggestion.sources.join("، ")}</p>
      )}

      {editing ? (
        <div className="mb-4 space-y-3 rounded-lg border border-border-color p-4">
          <input
            value={form.metaTitle ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, metaTitle: e.target.value }))}
            placeholder="عنوان سئو (Meta Title)"
            className="w-full rounded-lg border border-border-color bg-background px-3 py-2 text-sm"
          />
          <textarea
            value={form.metaDescription ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, metaDescription: e.target.value }))}
            placeholder="توضیح متا (Meta Description)"
            rows={3}
            className="w-full rounded-lg border border-border-color bg-background px-3 py-2 text-sm"
          />
          <input
            value={form.searchKeywords ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, searchKeywords: e.target.value }))}
            placeholder="کلمات کلیدی"
            className="w-full rounded-lg border border-border-color bg-background px-3 py-2 text-sm"
          />
          <textarea
            value={form.descriptionSuggestion ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, descriptionSuggestion: e.target.value }))}
            placeholder="توضیحات پیشنهادی محصول"
            rows={6}
            className="w-full rounded-lg border border-border-color bg-background px-3 py-2 text-sm"
          />
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
            <p className="mb-1 text-xs font-bold text-foreground/50">عنوان سئو (Meta Title)</p>
            <p>{suggestion.metaTitle || "—"}</p>
          </div>
          <div>
            <p className="mb-1 text-xs font-bold text-foreground/50">توضیح متا (Meta Description)</p>
            <p>{suggestion.metaDescription || "—"}</p>
          </div>
          <div>
            <p className="mb-1 text-xs font-bold text-foreground/50">کلمات کلیدی</p>
            <p>{suggestion.searchKeywords || "—"}</p>
          </div>
          {suggestion.h1Suggestion && (
            <div>
              <p className="mb-1 text-xs font-bold text-foreground/50">پیشنهاد H1 (فقط اطلاعاتی — هرگز خودکار روی نام محصول اعمال نمی‌شود)</p>
              <p>{suggestion.h1Suggestion}</p>
            </div>
          )}
          <div>
            <p className="mb-1 text-xs font-bold text-foreground/50">توضیحات پیشنهادی محصول</p>
            <p className="whitespace-pre-line">{suggestion.descriptionSuggestion || "—"}</p>
          </div>
          {suggestion.faq && suggestion.faq.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-bold text-foreground/50">پرسش‌های متداول پیشنهادی</p>
              {suggestion.faq.map((f, i) => (
                <p key={i}>
                  <strong>س: {f.q}</strong>
                  <br />
                  ج: {f.a}
                </p>
              ))}
            </div>
          )}
          {suggestion.altTextSuggestions && Object.keys(suggestion.altTextSuggestions).length > 0 && (
            <div>
              <p className="mb-1 text-xs font-bold text-foreground/50">متن جایگزین تصاویر پیشنهادی</p>
              <ul className="list-inside list-disc">
                {Object.entries(suggestion.altTextSuggestions).map(([imgId, alt]) => (
                  <li key={imgId}>
                    {imageNameById.get(imgId) ? "تصویر محصول" : `تصویر (${imgId.slice(0, 6)})`}: {alt}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {suggestion.internalLinks && suggestion.internalLinks.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-bold text-foreground/50">لینک‌های داخلی پیشنهادی (فقط صفحات واقعی موجود)</p>
              <ul className="list-inside list-disc">
                {suggestion.internalLinks.map((l, i) => (
                  <li key={i}>
                    <a href={l.url} target="_blank" rel="noreferrer" className="text-brand hover:underline">
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {suggestion.appliedFields && suggestion.appliedFields.length > 0 && (
            <p className="text-xs text-green-500">فیلدهای اعمال‌شده روی محصول: {suggestion.appliedFields.join("، ")}</p>
          )}
        </div>
      )}

      {pending && !editing && (
        <div className="flex flex-wrap gap-2">
          <button onClick={handleApprove} disabled={saving} className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-[#0b0e14] disabled:opacity-50">
            تأیید و اعمال روی محصول
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

      {suggestion.status === "REJECTED" && suggestion.rejectionReason && <p className="text-sm text-red-500">دلیل رد: {suggestion.rejectionReason}</p>}
    </div>
  );
}
