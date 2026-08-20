"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { ProductAiDraft } from "@/lib/types";
import AdminHelp from "@/components/admin/AdminHelp";

const STATUS_LABEL: Record<ProductAiDraft["status"], string> = {
  PENDING_REVIEW: "در انتظار بررسی",
  APPROVED: "تأیید شده",
  REJECTED: "رد شده",
};

export default function AdminAiProductsPage() {
  const { accessToken } = useAuth();
  const { toast } = useToast();
  const [drafts, setDrafts] = useState<ProductAiDraft[] | null>(null);
  const [name, setName] = useState("");
  const [brandName, setBrandName] = useState("");
  const [modelNumber, setModelNumber] = useState("");
  const [ownerPrice, setOwnerPrice] = useState("");
  const [preparing, setPreparing] = useState(false);

  function load() {
    if (!accessToken) return;
    api.get<ProductAiDraft[]>("/ai-product/drafts", accessToken).then(setDrafts);
  }

  useEffect(load, [accessToken]);

  async function handlePrepare(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !ownerPrice) return;
    setPreparing(true);
    try {
      await api.post(
        "/ai-product/prepare",
        { name: name.trim(), brandName: brandName.trim() || undefined, modelNumber: modelNumber.trim() || undefined, ownerPrice: Number(ownerPrice) },
        accessToken,
      );
      toast("پیش‌نویس محصول آماده شد — پیش از انتشار بررسی کنید.", "success");
      setName("");
      setBrandName("");
      setModelNumber("");
      setOwnerPrice("");
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "آماده‌سازی محصول با خطا مواجه شد.", "error");
    } finally {
      setPreparing(false);
    }
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">آماده‌سازی محصول با هوش مصنوعی</h1>

      <AdminHelp storageKey="ai-products">
        <p>فقط نام محصول، برند/مدل و قیمتی که خودتان تعیین می‌کنید را وارد کنید. هوش مصنوعی توضیحات، مشخصات فنی، ویژگی‌ها، پرسش‌های متداول و اطلاعات سئو را پیش‌نویس می‌کند.</p>
        <p>هیچ محصولی از این طریق منتشر نمی‌شود مگر اینکه شما وارد صفحه‌ی پیش‌نویس شوید و آن را بررسی و تأیید کنید. می‌توانید هر قسمت را قبل از تأیید ویرایش کنید یا کلاً رد کنید.</p>
        <p>هوش مصنوعی به اینترنت زنده دسترسی ندارد و فقط از دانش عمومی خودش استفاده می‌کند؛ قیمت پیشنهادی صرفاً یک تخمین است، نه قیمت قطعی. حتماً پیش از انتشار عمومی، مشخصات فنی حساس را خودتان بررسی کنید.</p>
        <p>سیستم به‌صورت خودکار برای هر محصول تصویر جستجو و آماده می‌کند (Image Autopilot) و در صفحه‌ی پیش‌نویس نمایش می‌دهد؛ می‌توانید هر تصویر را تأیید، رد، جایگزین یا بازتولید کنید و تصویر اصلی را خودتان انتخاب کنید. اگر تصویر مناسبی پیدا نشود، پیام «تصویر خودکار آماده نشد» را می‌بینید و می‌توانید تصویر را دستی بارگذاری کنید. تصاویری که با هوش مصنوعی ساخته شده‌اند (نه واقعی) همیشه با یک برچسب هشدار مشخص می‌شوند.</p>
        <p>اگر کلید API هوش مصنوعی در «تنظیمات» وارد نشده باشد، این قابلیت کار نمی‌کند. برای جستجوی خودکار تصویر و تولید تصویر با هوش مصنوعی، به کلیدهای جداگانه‌ای در «تنظیمات» نیاز است که اختیاری هستند.</p>
      </AdminHelp>

      <form onSubmit={handlePrepare} className="mb-8 grid gap-3 rounded-lg border border-border-color p-4 sm:grid-cols-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="نام محصول *"
          required
          className="rounded-lg border border-border-color bg-background px-3 py-2 text-sm"
        />
        <input
          value={ownerPrice}
          onChange={(e) => setOwnerPrice(e.target.value)}
          type="number"
          min="0"
          placeholder="قیمت فروش (تومان) *"
          required
          className="rounded-lg border border-border-color bg-background px-3 py-2 text-sm"
        />
        <input
          value={brandName}
          onChange={(e) => setBrandName(e.target.value)}
          placeholder="برند (اختیاری)"
          className="rounded-lg border border-border-color bg-background px-3 py-2 text-sm"
        />
        <input
          value={modelNumber}
          onChange={(e) => setModelNumber(e.target.value)}
          placeholder="مدل (اختیاری)"
          className="rounded-lg border border-border-color bg-background px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={preparing}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-[#0b0e14] disabled:opacity-50 sm:col-span-2"
        >
          {preparing ? "در حال آماده‌سازی با هوش مصنوعی..." : "آماده‌سازی با هوش مصنوعی"}
        </button>
      </form>

      <h2 className="mb-3 font-bold">پیش‌نویس‌ها</h2>
      {drafts === null ? (
        <p className="text-sm text-foreground/50">در حال بارگذاری...</p>
      ) : drafts.length === 0 ? (
        <p className="text-sm text-foreground/50">هنوز پیش‌نویسی ساخته نشده است.</p>
      ) : (
        <div className="space-y-2">
          {drafts.map((d) => (
            <Link
              key={d.id}
              href={`/admin/ai-products/${d.id}`}
              className="flex items-center justify-between rounded-lg border border-border-color p-3 text-sm hover:border-brand"
            >
              <div>
                <p className="font-bold">{d.name}</p>
                <p className="text-xs text-foreground/50">
                  {d.brandName ?? "بدون برند"} — قیمت مالک: {Number(d.ownerPrice).toLocaleString("fa-IR")} تومان
                </p>
              </div>
              <span
                className={`rounded px-2 py-0.5 text-xs ${
                  d.status === "PENDING_REVIEW" ? "bg-brand/10 text-brand" : d.status === "APPROVED" ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"
                }`}
              >
                {STATUS_LABEL[d.status]}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
