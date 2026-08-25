"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { ContentDraft, ContentDraftType } from "@/lib/types";

const TYPE_LABEL: Record<ContentDraftType, string> = {
  BLOG_POST: "مقاله وبلاگ",
  BUYING_GUIDE: "راهنمای خرید",
  COMPARISON: "مقایسه دو محصول",
  FAQ: "پرسش‌های متداول",
  EDUCATIONAL_ARTICLE: "مقاله آموزشی",
  PRODUCT_INTRO: "معرفی محصول",
  CATEGORY_CONTENT: "محتوای دسته‌بندی",
};

const STATUS_LABEL: Record<ContentDraft["status"], string> = {
  PENDING_REVIEW: "در انتظار بررسی",
  APPROVED: "تأیید شده — منتشر نشده",
  REJECTED: "رد شده",
  PUBLISHED: "منتشرشده",
};

const STATUS_STYLE: Record<ContentDraft["status"], string> = {
  PENDING_REVIEW: "bg-brand/10 text-brand",
  APPROVED: "bg-blue-500/10 text-blue-500",
  REJECTED: "bg-red-500/10 text-red-500",
  PUBLISHED: "bg-green-500/10 text-green-500",
};

export default function ContentDraftDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { accessToken } = useAuth();
  const { toast } = useToast();
  const [draft, setDraft] = useState<ContentDraft | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<ContentDraft>>({});
  const [saving, setSaving] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  function load() {
    if (!accessToken || !id) return;
    api.get<ContentDraft>(`/content-drafts/${id}`, accessToken).then((d) => {
      setDraft(d);
      setForm(d);
    });
  }

  useEffect(load, [accessToken, id]);

  async function handleSaveEdit() {
    setSaving(true);
    try {
      await api.patch(
        `/content-drafts/${id}`,
        {
          title: form.title || undefined,
          excerpt: form.excerpt || undefined,
          body: form.body || undefined,
          metaTitle: form.metaTitle || undefined,
          metaDescription: form.metaDescription || undefined,
          suggestedImagePrompt: form.suggestedImagePrompt || undefined,
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
      await api.post(`/content-drafts/${id}/approve`, { publish }, accessToken);
      toast(publish ? "محتوا تأیید و منتشر شد." : "محتوا به‌عنوان پیش‌نویس تأیید شد.", "success");
      if (publish) router.push("/admin/content");
      else load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "تأیید محتوا با خطا مواجه شد.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish() {
    setSaving(true);
    try {
      await api.post(`/content-drafts/${id}/publish`, undefined, accessToken);
      toast("محتوا منتشر شد.", "success");
      router.push("/admin/content");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "انتشار محتوا با خطا مواجه شد.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleReject() {
    setSaving(true);
    try {
      await api.post(`/content-drafts/${id}/reject`, { reason: rejectReason || undefined }, accessToken);
      toast("پیش‌نویس رد شد.", "success");
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "رد کردن پیش‌نویس با خطا مواجه شد.", "error");
    } finally {
      setSaving(false);
    }
  }

  if (!draft) return <p className="text-sm text-foreground/50">در حال بارگذاری...</p>;

  const pending = draft.status === "PENDING_REVIEW";
  const approvedNotPublished = draft.status === "APPROVED";

  return (
    <div>
      <Link href="/admin/content" className="mb-4 inline-block text-sm text-brand hover:underline">
        ← بازگشت به تولید محتوا
      </Link>

      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-2xl font-bold">{draft.title || draft.topic}</h1>
        <span className={`rounded px-2 py-0.5 text-xs ${STATUS_STYLE[draft.status]}`}>{STATUS_LABEL[draft.status]}</span>
      </div>
      <p className="mb-4 text-xs text-foreground/50">
        {TYPE_LABEL[draft.type]} — موضوع: {draft.topic}
      </p>

      {draft.sources && draft.sources.length > 0 && <p className="mb-4 text-xs text-foreground/50">منبع اطلاعات: {draft.sources.join("، ")}</p>}

      {editing ? (
        <div className="mb-4 space-y-3 rounded-lg border border-border-color p-4">
          <input
            value={form.title ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="عنوان"
            className="w-full rounded-lg border border-border-color bg-background px-3 py-2 text-sm"
          />
          <textarea
            value={form.excerpt ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, excerpt: e.target.value }))}
            placeholder="خلاصه"
            rows={2}
            className="w-full rounded-lg border border-border-color bg-background px-3 py-2 text-sm"
          />
          <textarea
            value={form.body ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
            placeholder="متن کامل"
            rows={12}
            className="w-full rounded-lg border border-border-color bg-background px-3 py-2 text-sm"
          />
          <input
            value={form.metaTitle ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, metaTitle: e.target.value }))}
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
          {draft.excerpt && (
            <div>
              <p className="mb-1 text-xs font-bold text-foreground/50">خلاصه</p>
              <p>{draft.excerpt}</p>
            </div>
          )}
          {draft.body && (
            <div>
              <p className="mb-1 text-xs font-bold text-foreground/50">متن کامل</p>
              <p className="whitespace-pre-line">{draft.body}</p>
            </div>
          )}
          {draft.faq && draft.faq.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-bold text-foreground/50">پرسش‌های متداول</p>
              {draft.faq.map((f, i) => (
                <p key={i}>
                  <strong>س: {f.q}</strong>
                  <br />
                  ج: {f.a}
                </p>
              ))}
            </div>
          )}
          {draft.metaTitle && (
            <div>
              <p className="mb-1 text-xs font-bold text-foreground/50">عنوان سئو</p>
              <p>{draft.metaTitle}</p>
            </div>
          )}
          {draft.metaDescription && (
            <div>
              <p className="mb-1 text-xs font-bold text-foreground/50">توضیح متا سئو</p>
              <p>{draft.metaDescription}</p>
            </div>
          )}
          {draft.suggestedImagePrompt && (
            <div>
              <p className="mb-1 text-xs font-bold text-foreground/50">پیشنهاد تصویر</p>
              <p>{draft.suggestedImagePrompt}</p>
            </div>
          )}
          {draft.internalLinks && draft.internalLinks.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-bold text-foreground/50">لینک‌های داخلی پیشنهادی (فقط صفحات واقعی موجود)</p>
              <ul className="list-inside list-disc">
                {draft.internalLinks.map((l, i) => (
                  <li key={i}>
                    <a href={l.url} target="_blank" rel="noreferrer" className="text-brand hover:underline">
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
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

      {draft.status === "REJECTED" && draft.rejectionReason && <p className="text-sm text-red-500">دلیل رد: {draft.rejectionReason}</p>}
      {draft.status === "PUBLISHED" && draft.publishedBlogPostId && (
        <p className="text-sm text-green-500">
          منتشرشده به‌عنوان مقاله وبلاگ — <Link href="/admin/blog" className="underline">مشاهده در وبلاگ</Link>
        </p>
      )}
      {draft.status === "PUBLISHED" && !draft.publishedBlogPostId && draft.type === "PRODUCT_INTRO" && (
        <p className="text-sm text-green-500">
          منتشرشده — توضیحات محصول به‌روزرسانی شد. <Link href="/admin/products" className="underline">مشاهده در محصولات</Link>
        </p>
      )}
      {draft.status === "PUBLISHED" && !draft.publishedBlogPostId && draft.type === "CATEGORY_CONTENT" && (
        <p className="text-sm text-green-500">
          منتشرشده — توضیحات دسته‌بندی به‌روزرسانی شد. <Link href="/admin/categories" className="underline">مشاهده در دسته‌بندی‌ها</Link>
        </p>
      )}
    </div>
  );
}
