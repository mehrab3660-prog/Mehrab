"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { ProductAiDraft, ProductAiDraftImage } from "@/lib/types";

const STATUS_LABEL: Record<ProductAiDraft["status"], string> = {
  PENDING_REVIEW: "در انتظار بررسی",
  APPROVED: "تأیید شده",
  REJECTED: "رد شده",
};

const IMAGE_TYPE_LABEL: Record<ProductAiDraftImage["imageType"], string> = {
  REAL_SOURCE: "یافت‌شده از اینترنت",
  PROCESSED_REAL: "تصویر واقعی (پردازش‌شده)",
  AI_GENERATED: "تولیدشده با هوش مصنوعی",
  ADMIN_UPLOADED: "بارگذاری دستی",
};

const IMAGE_STATUS_LABEL: Record<ProductAiDraftImage["status"], string> = {
  CANDIDATE: "کاندید — هنوز بررسی نشده",
  APPROVED: "تأیید شده",
  REJECTED: "رد شده",
};

export default function AiProductDraftDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { accessToken } = useAuth();
  const { toast } = useToast();
  const [draft, setDraft] = useState<ProductAiDraft | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<ProductAiDraft>>({});
  const [saving, setSaving] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [searchingImages, setSearchingImages] = useState(false);
  const [imageBusy, setImageBusy] = useState<Record<string, boolean>>({});
  const [uploadingImage, setUploadingImage] = useState(false);

  function load() {
    if (!accessToken || !id) return;
    api.get<ProductAiDraft>(`/ai-product/drafts/${id}`, accessToken).then((d) => {
      setDraft(d);
      setForm(d);
    });
  }

  useEffect(load, [accessToken, id]);

  async function handleSaveEdit() {
    setSaving(true);
    try {
      await api.patch(
        `/ai-product/drafts/${id}`,
        {
          name: form.name,
          brandName: form.brandName || undefined,
          categoryName: form.categoryName || undefined,
          description: form.description || undefined,
          seoTitle: form.seoTitle || undefined,
          seoDescription: form.seoDescription || undefined,
          suggestedPrice: form.suggestedPrice ? Number(form.suggestedPrice) : undefined,
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
      await api.post(`/ai-product/drafts/${id}/approve`, { publish }, accessToken);
      toast(publish ? "محصول تأیید و منتشر شد." : "محصول به‌عنوان پیش‌نویس ذخیره شد.", "success");
      router.push("/admin/products");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "تأیید محصول با خطا مواجه شد.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleReject() {
    setSaving(true);
    try {
      await api.post(`/ai-product/drafts/${id}/reject`, { reason: rejectReason || undefined }, accessToken);
      toast("پیش‌نویس رد شد.", "success");
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "رد کردن پیش‌نویس با خطا مواجه شد.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleImageSearch() {
    setSearchingImages(true);
    try {
      await api.post(`/ai-product/drafts/${id}/images/search`, undefined, accessToken);
      toast("جستجوی تصویر انجام شد.", "success");
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "جستجوی تصویر با خطا مواجه شد.", "error");
    } finally {
      setSearchingImages(false);
    }
  }

  async function handleImageAction(imageId: string, action: "approve" | "reject" | "set-main" | "regenerate") {
    setImageBusy((prev) => ({ ...prev, [imageId]: true }));
    try {
      if (action === "set-main") {
        await api.patch(`/ai-product/drafts/${id}/images/${imageId}/set-main`, undefined, accessToken);
      } else {
        await api.post(`/ai-product/drafts/${id}/images/${imageId}/${action}`, undefined, accessToken);
      }
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "عملیات روی تصویر با خطا مواجه شد.", "error");
    } finally {
      setImageBusy((prev) => ({ ...prev, [imageId]: false }));
    }
  }

  async function handleManualUpload(file: File) {
    setUploadingImage(true);
    try {
      await api.upload(`/ai-product/drafts/${id}/images`, file, "file", accessToken);
      toast("تصویر با موفقیت اضافه شد.", "success");
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "بارگذاری تصویر با خطا مواجه شد.", "error");
    } finally {
      setUploadingImage(false);
    }
  }

  if (!draft) return <p className="text-sm text-foreground/50">در حال بارگذاری...</p>;

  const pending = draft.status === "PENDING_REVIEW";

  return (
    <div>
      <Link href="/admin/ai-products" className="mb-4 inline-block text-sm text-brand hover:underline">
        ← بازگشت به لیست پیش‌نویس‌ها
      </Link>

      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">{draft.name}</h1>
        <span
          className={`rounded px-2 py-0.5 text-xs ${
            draft.status === "PENDING_REVIEW" ? "bg-brand/10 text-brand" : draft.status === "APPROVED" ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"
          }`}
        >
          {STATUS_LABEL[draft.status]}
        </span>
      </div>

      {draft.confidenceNote && (
        <div className="mb-4 rounded-lg border border-dashed border-amber-500/50 bg-amber-500/5 p-3 text-sm text-amber-500">
          <strong>نکته‌ی هوش مصنوعی برای بررسی شما: </strong>
          {draft.confidenceNote}
        </div>
      )}

      {draft.sources && draft.sources.length > 0 && (
        <p className="mb-4 text-xs text-foreground/50">منبع اطلاعات: {draft.sources.join("، ")}</p>
      )}

      <div className="mb-4 grid gap-3 rounded-lg border border-border-color p-4 sm:grid-cols-2">
        <div>
          <p className="text-xs text-foreground/50">قیمتی که شما وارد کردید</p>
          <p className="font-bold">{Number(draft.ownerPrice).toLocaleString("fa-IR")} تومان</p>
        </div>
        <div>
          <p className="text-xs text-foreground/50">قیمت پیشنهادی هوش مصنوعی (فقط تخمین)</p>
          <p className="font-bold">{draft.suggestedPrice ? `${Number(draft.suggestedPrice).toLocaleString("fa-IR")} تومان` : "ارائه نشده"}</p>
        </div>
        <div>
          <p className="text-xs text-foreground/50">برند</p>
          <p>{draft.brandName ?? "—"}</p>
        </div>
        <div>
          <p className="text-xs text-foreground/50">دسته‌بندی پیشنهادی</p>
          <p>{draft.categoryName ?? "—"}</p>
        </div>
      </div>

      {editing ? (
        <div className="mb-4 space-y-3 rounded-lg border border-border-color p-4">
          <input
            value={form.name ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="نام محصول"
            className="w-full rounded-lg border border-border-color bg-background px-3 py-2 text-sm"
          />
          <input
            value={form.brandName ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, brandName: e.target.value }))}
            placeholder="برند"
            className="w-full rounded-lg border border-border-color bg-background px-3 py-2 text-sm"
          />
          <input
            value={form.categoryName ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, categoryName: e.target.value }))}
            placeholder="دسته‌بندی"
            className="w-full rounded-lg border border-border-color bg-background px-3 py-2 text-sm"
          />
          <textarea
            value={form.description ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="توضیحات"
            rows={6}
            className="w-full rounded-lg border border-border-color bg-background px-3 py-2 text-sm"
          />
          <input
            value={form.seoTitle ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, seoTitle: e.target.value }))}
            placeholder="عنوان سئو"
            className="w-full rounded-lg border border-border-color bg-background px-3 py-2 text-sm"
          />
          <textarea
            value={form.seoDescription ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, seoDescription: e.target.value }))}
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
          {draft.description && (
            <div>
              <p className="mb-1 text-xs font-bold text-foreground/50">توضیحات</p>
              <p className="whitespace-pre-line">{draft.description}</p>
            </div>
          )}
          {draft.specs && Object.keys(draft.specs).length > 0 && (
            <div>
              <p className="mb-1 text-xs font-bold text-foreground/50">مشخصات فنی</p>
              <ul className="list-inside list-disc">
                {Object.entries(draft.specs).map(([k, v]) => (
                  <li key={k}>
                    {k}: {v}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {draft.features && draft.features.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-bold text-foreground/50">ویژگی‌ها</p>
              <ul className="list-inside list-disc">
                {draft.features.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
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
          {draft.seoTitle && (
            <div>
              <p className="mb-1 text-xs font-bold text-foreground/50">عنوان سئو</p>
              <p>{draft.seoTitle}</p>
            </div>
          )}
          {draft.seoDescription && (
            <div>
              <p className="mb-1 text-xs font-bold text-foreground/50">توضیح متا سئو</p>
              <p>{draft.seoDescription}</p>
            </div>
          )}
        </div>
      )}

      <div className="mb-4 rounded-lg border border-border-color p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-bold">تصویر خودکار (Image Autopilot)</h2>
          {pending && (
            <button
              onClick={handleImageSearch}
              disabled={searchingImages}
              className="rounded-lg border border-border-color px-3 py-1 text-xs hover:border-brand hover:text-brand disabled:opacity-50"
            >
              {searchingImages ? "در حال جستجو..." : "جستجوی مجدد تصویر"}
            </button>
          )}
        </div>

        {draft.imageAutopilotNote && (!draft.images || draft.images.filter((i) => i.status !== "REJECTED").length === 0) && (
          <p className="mb-3 rounded-lg border border-dashed border-amber-500/50 bg-amber-500/5 p-3 text-xs text-amber-500">
            {draft.imageAutopilotNote}
          </p>
        )}

        {draft.images && draft.images.length > 0 && (
          <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {draft.images.map((img) => (
              <div key={img.id} className={`rounded-lg border p-2 text-xs ${img.status === "REJECTED" ? "border-border-color opacity-50" : img.isMain ? "border-brand" : "border-border-color"}`}>
                {img.thumbnailUrl || img.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={img.thumbnailUrl ?? img.url ?? ""} alt={draft.name} className="mb-2 h-32 w-full rounded object-cover" />
                ) : (
                  <div className="mb-2 flex h-32 w-full items-center justify-center rounded bg-surface text-foreground/40">بدون پیش‌نمایش</div>
                )}

                <div className="flex flex-wrap items-center gap-1">
                  {img.isMain && <span className="rounded bg-brand/10 px-1.5 py-0.5 text-brand">تصویر اصلی</span>}
                  <span className="rounded bg-surface px-1.5 py-0.5">{IMAGE_TYPE_LABEL[img.imageType]}</span>
                  <span
                    className={`rounded px-1.5 py-0.5 ${
                      img.status === "APPROVED" ? "bg-green-500/10 text-green-500" : img.status === "REJECTED" ? "bg-red-500/10 text-red-500" : "bg-surface"
                    }`}
                  >
                    {IMAGE_STATUS_LABEL[img.status]}
                  </span>
                </div>

                {img.imageType === "AI_GENERATED" && (
                  <p className="mt-1 rounded bg-amber-500/10 px-1.5 py-1 text-amber-500">
                    ⚠️ این یک عکس واقعی نیست — با هوش مصنوعی ساخته شده و نباید به‌عنوان عکس واقعی محصول معرفی شود.
                  </p>
                )}

                <div className="mt-1 space-y-0.5 text-foreground/50">
                  {img.width && img.height && <p>ابعاد: {img.width}×{img.height}</p>}
                  {typeof img.relevanceScore === "number" && <p>امتیاز ارتباط: {Math.round(img.relevanceScore * 100)}٪</p>}
                  {img.sourceProvider && <p>منبع: {img.sourceProvider}{img.isOfficialSource ? " (رسمی)" : ""}</p>}
                  {img.aiProvider && <p>سرویس تولید: {img.aiProvider}</p>}
                  {img.rejectionReason && <p className="text-red-500">دلیل رد: {img.rejectionReason}</p>}
                </div>

                {pending && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {img.status !== "APPROVED" && (
                      <button
                        onClick={() => handleImageAction(img.id, "approve")}
                        disabled={imageBusy[img.id]}
                        className="rounded border border-border-color px-2 py-0.5 hover:border-brand hover:text-brand disabled:opacity-50"
                      >
                        استفاده از این تصویر
                      </button>
                    )}
                    {!img.isMain && img.status !== "REJECTED" && (
                      <button
                        onClick={() => handleImageAction(img.id, "set-main")}
                        disabled={imageBusy[img.id]}
                        className="rounded border border-border-color px-2 py-0.5 hover:border-brand hover:text-brand disabled:opacity-50"
                      >
                        تصویر اصلی کن
                      </button>
                    )}
                    {img.status !== "REJECTED" && (
                      <button
                        onClick={() => handleImageAction(img.id, "reject")}
                        disabled={imageBusy[img.id]}
                        className="rounded border border-red-500/40 px-2 py-0.5 text-red-500 disabled:opacity-50"
                      >
                        رد تصویر
                      </button>
                    )}
                    <button
                      onClick={() => handleImageAction(img.id, "regenerate")}
                      disabled={imageBusy[img.id]}
                      className="rounded border border-border-color px-2 py-0.5 hover:border-brand hover:text-brand disabled:opacity-50"
                    >
                      بازتولید با AI
                    </button>
                    {img.sourceUrl && (
                      <a href={img.sourceUrl} target="_blank" rel="noreferrer" className="rounded border border-border-color px-2 py-0.5 hover:border-brand hover:text-brand">
                        منبع را ببین
                      </a>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {pending && (
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border-color px-3 py-2 text-xs text-foreground/70 hover:border-brand">
            {uploadingImage ? "در حال بارگذاری..." : "جایگزینی/افزودن تصویر به‌صورت دستی"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              disabled={uploadingImage}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleManualUpload(file);
                e.target.value = "";
              }}
            />
          </label>
        )}
      </div>

      {pending && !editing && (
        <div className="flex flex-wrap gap-2">
          <button onClick={() => handleApprove(true)} disabled={saving} className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-[#0b0e14] disabled:opacity-50">
            تأیید و انتشار
          </button>
          <button onClick={() => handleApprove(false)} disabled={saving} className="rounded-lg border border-border-color px-4 py-2 text-sm disabled:opacity-50">
            ذخیره به‌عنوان پیش‌نویس
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

      {draft.status === "REJECTED" && draft.rejectionReason && (
        <p className="text-sm text-red-500">دلیل رد: {draft.rejectionReason}</p>
      )}
    </div>
  );
}
