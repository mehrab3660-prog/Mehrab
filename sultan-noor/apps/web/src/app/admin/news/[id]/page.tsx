"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { NewsItem, NewsItemStatus } from "@/lib/types";

const STATUS_LABEL: Record<NewsItemStatus, string> = {
  DISCOVERED: "کشف‌شده",
  VERIFIED: "تأییدشده (منبع)",
  AI_DRAFT: "در حال تولید پیش‌نویس",
  PENDING_REVIEW: "در انتظار بررسی",
  APPROVED: "تأیید شده — منتشر نشده",
  PUBLISHED: "منتشرشده",
  REJECTED: "رد شده",
};

const STATUS_STYLE: Record<NewsItemStatus, string> = {
  DISCOVERED: "bg-surface-2 text-foreground/60",
  VERIFIED: "bg-blue-500/10 text-blue-500",
  AI_DRAFT: "bg-blue-500/10 text-blue-500",
  PENDING_REVIEW: "bg-brand/10 text-brand",
  APPROVED: "bg-blue-500/10 text-blue-500",
  PUBLISHED: "bg-green-500/10 text-green-500",
  REJECTED: "bg-red-500/10 text-red-500",
};

export default function NewsItemDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { accessToken } = useAuth();
  const { toast } = useToast();
  const [item, setItem] = useState<NewsItem | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<NewsItem>>({});
  const [saving, setSaving] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  function load() {
    if (!accessToken || !id) return;
    api.get<NewsItem>(`/news/items/${id}`, accessToken).then((d) => {
      setItem(d);
      setForm(d);
    });
  }

  useEffect(load, [accessToken, id]);

  async function handleSaveEdit() {
    setSaving(true);
    try {
      await api.patch(
        `/news/items/${id}`,
        {
          draftTitle: form.draftTitle || undefined,
          draftExcerpt: form.draftExcerpt || undefined,
          draftBody: form.draftBody || undefined,
          category: form.category || undefined,
          tags: form.tags || undefined,
          seoTitle: form.seoTitle || undefined,
          metaDescription: form.metaDescription || undefined,
          keywords: form.keywords || undefined,
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

  async function handleApprove(publish: boolean) {
    setSaving(true);
    try {
      await api.post(`/news/items/${id}/approve`, undefined, accessToken);
      if (publish) {
        await api.post(`/news/items/${id}/publish`, undefined, accessToken);
        toast("خبر تأیید و منتشر شد.", "success");
        router.push("/admin/news");
        return;
      }
      toast("خبر به‌عنوان پیش‌نویس تأیید شد.", "success");
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "تأیید خبر با خطا مواجه شد.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish() {
    setSaving(true);
    try {
      await api.post(`/news/items/${id}/publish`, undefined, accessToken);
      toast("خبر منتشر شد.", "success");
      router.push("/admin/news");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "انتشار خبر با خطا مواجه شد.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleReject() {
    setSaving(true);
    try {
      await api.post(`/news/items/${id}/reject`, { reason: rejectReason || undefined }, accessToken);
      toast("خبر رد شد.", "success");
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "رد کردن خبر با خطا مواجه شد.", "error");
    } finally {
      setSaving(false);
    }
  }

  if (!item) return <p className="text-sm text-foreground/50">در حال بارگذاری...</p>;

  const pending = item.status === "PENDING_REVIEW";
  const approvedNotPublished = item.status === "APPROVED";

  return (
    <div>
      <Link href="/admin/news" className="mb-4 inline-block text-sm text-brand hover:underline">
        ← بازگشت به اخبار برق
      </Link>

      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-2xl font-bold">{item.draftTitle || item.rawTitle}</h1>
        <span className={`rounded px-2 py-0.5 text-xs ${STATUS_STYLE[item.status]}`}>{STATUS_LABEL[item.status]}</span>
      </div>
      <p className="mb-4 text-xs text-foreground/50">
        منبع: {item.sourceName} —{" "}
        <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="text-brand hover:underline">
          مشاهده منبع اصلی
        </a>
        {item.publishedAt && ` — تاریخ انتشار منبع: ${new Date(item.publishedAt).toLocaleDateString("fa-IR")}`}
      </p>

      {item.confidenceNote && (
        <div className="mb-4 rounded-lg border border-dashed border-amber-500/50 bg-amber-500/5 p-3 text-xs text-amber-500">
          یادداشت اطمینان: {item.confidenceNote}
        </div>
      )}

      {item.status === "DISCOVERED" && (
        <p className="mb-4 text-sm text-foreground/60">این خبر هنوز تأیید صحت نشده — از دکمه «بررسی صحت اخبار کشف‌شده» در صفحه اخبار استفاده کنید.</p>
      )}
      {item.status === "VERIFIED" && <p className="mb-4 text-sm text-foreground/60">این خبر تأیید صحت شده و آماده‌ی ساخت پیش‌نویس با AI است.</p>}

      {item.imageUrl && (
        <div className="mb-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.imageUrl} alt={item.draftTitle ?? item.rawTitle} className="max-h-64 rounded-lg object-cover" />
          <p className="mt-1 text-xs text-foreground/40">
            {item.imageIsAiGenerated ? "تصویر تولیدشده با هوش مصنوعی (AI Generated)" : "تصویر واقعی"}
            {item.imageAttribution && ` — منبع: ${item.imageAttribution}`}
          </p>
        </div>
      )}

      {editing ? (
        <div className="mb-4 space-y-3 rounded-lg border border-border-color p-4">
          <input
            value={form.draftTitle ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, draftTitle: e.target.value }))}
            placeholder="عنوان"
            className="w-full rounded-lg border border-border-color bg-background px-3 py-2 text-sm"
          />
          <textarea
            value={form.draftExcerpt ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, draftExcerpt: e.target.value }))}
            placeholder="خلاصه"
            rows={2}
            className="w-full rounded-lg border border-border-color bg-background px-3 py-2 text-sm"
          />
          <textarea
            value={form.draftBody ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, draftBody: e.target.value }))}
            placeholder="متن کامل"
            rows={12}
            className="w-full rounded-lg border border-border-color bg-background px-3 py-2 text-sm"
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              value={form.category ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              placeholder="دسته‌بندی"
              className="w-full rounded-lg border border-border-color bg-background px-3 py-2 text-sm"
            />
            <input
              value={form.tags ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
              placeholder="برچسب‌ها (با کاما جدا شود)"
              className="w-full rounded-lg border border-border-color bg-background px-3 py-2 text-sm"
            />
          </div>
          <input
            value={form.seoTitle ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, seoTitle: e.target.value }))}
            placeholder="عنوان سئو"
            className="w-full rounded-lg border border-border-color bg-background px-3 py-2 text-sm"
          />
          <textarea
            value={form.metaDescription ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, metaDescription: e.target.value }))}
            placeholder="توضیح متا سئو"
            rows={2}
            className="w-full rounded-lg border border-border-color bg-background px-3 py-2 text-sm"
          />
          <input
            value={form.keywords ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, keywords: e.target.value }))}
            placeholder="کلمات کلیدی"
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
          {item.draftExcerpt && (
            <div>
              <p className="mb-1 text-xs font-bold text-foreground/50">خلاصه</p>
              <p>{item.draftExcerpt}</p>
            </div>
          )}
          {item.draftBody && (
            <div>
              <p className="mb-1 text-xs font-bold text-foreground/50">متن کامل</p>
              <p className="whitespace-pre-line">{item.draftBody}</p>
            </div>
          )}
          {item.faq && item.faq.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-bold text-foreground/50">پرسش‌های متداول</p>
              {item.faq.map((f, i) => (
                <p key={i}>
                  <strong>س: {f.q}</strong>
                  <br />
                  ج: {f.a}
                </p>
              ))}
            </div>
          )}
          {item.confirmingSources && item.confirmingSources.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-bold text-foreground/50">منابع تأییدکننده</p>
              <ul className="list-inside list-disc">
                {item.confirmingSources.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          )}
          {item.seoTitle && (
            <div>
              <p className="mb-1 text-xs font-bold text-foreground/50">عنوان سئو</p>
              <p>{item.seoTitle}</p>
            </div>
          )}
          {item.metaDescription && (
            <div>
              <p className="mb-1 text-xs font-bold text-foreground/50">توضیح متا سئو</p>
              <p>{item.metaDescription}</p>
            </div>
          )}
        </div>
      )}

      {(pending || approvedNotPublished) && !editing && (
        <div className="flex flex-wrap gap-2">
          {pending && (
            <button onClick={() => handleApprove(true)} disabled={saving} className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-[#0b0e14] disabled:opacity-50">
              تأیید و انتشار
            </button>
          )}
          {pending && (
            <button onClick={() => handleApprove(false)} disabled={saving} className="rounded-lg border border-border-color px-4 py-2 text-sm disabled:opacity-50">
              ذخیره پیش‌نویس
            </button>
          )}
          {approvedNotPublished && (
            <button onClick={handlePublish} disabled={saving} className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-[#0b0e14] disabled:opacity-50">
              انتشار
            </button>
          )}
          <button onClick={() => setEditing(true)} className="rounded-lg border border-border-color px-4 py-2 text-sm">
            ویرایش
          </button>
          {pending && (
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
          )}
        </div>
      )}

      {item.status === "REJECTED" && item.rejectionReason && <p className="text-sm text-red-500">دلیل رد: {item.rejectionReason}</p>}
      {item.status === "PUBLISHED" && item.publishedBlogPostId && (
        <p className="text-sm text-green-500">
          منتشرشده به‌عنوان مقاله وبلاگ — <Link href="/admin/blog" className="underline">مشاهده در وبلاگ</Link>
        </p>
      )}
    </div>
  );
}
