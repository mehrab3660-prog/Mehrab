"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { NewsItem, NewsItemStatus, NewsSource } from "@/lib/types";
import AdminHelp from "@/components/admin/AdminHelp";

const STATUS_LABEL: Record<NewsItemStatus, string> = {
  DISCOVERED: "کشف‌شده",
  VERIFIED: "تأییدشده (منبع)",
  AI_DRAFT: "در حال تولید پیش‌نویس",
  PENDING_REVIEW: "در انتظار بررسی",
  APPROVED: "تأیید شده — منتشر نشده",
  PUBLISHED: "منتشرشده",
  REJECTED: "رد شده",
};

const STATUS_TABS: NewsItemStatus[] = ["PENDING_REVIEW", "VERIFIED", "DISCOVERED", "APPROVED", "PUBLISHED", "REJECTED"];

export default function AdminNewsPage() {
  const { accessToken } = useAuth();
  const { toast } = useToast();
  const [sources, setSources] = useState<NewsSource[]>([]);
  const [items, setItems] = useState<NewsItem[] | null>(null);
  const [status, setStatus] = useState<NewsItemStatus>("PENDING_REVIEW");
  const [newSourceName, setNewSourceName] = useState("");
  const [newSourceUrl, setNewSourceUrl] = useState("");
  const [newSourceCategory, setNewSourceCategory] = useState("");
  const [discovering, setDiscovering] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [generatingFor, setGeneratingFor] = useState<string | null>(null);

  function loadSources() {
    if (!accessToken) return;
    api.get<NewsSource[]>("/news/sources", accessToken).then(setSources);
  }

  function loadItems() {
    if (!accessToken) return;
    api.get<NewsItem[]>(`/news/items?status=${status}`, accessToken).then(setItems);
  }

  useEffect(loadSources, [accessToken]);
  useEffect(loadItems, [accessToken, status]);

  async function handleAddSource() {
    if (!newSourceName.trim() || !newSourceUrl.trim()) return;
    try {
      await api.post("/news/sources", { name: newSourceName, feedUrl: newSourceUrl, category: newSourceCategory || undefined }, accessToken);
      setNewSourceName("");
      setNewSourceUrl("");
      setNewSourceCategory("");
      toast("منبع خبری اضافه شد.", "success");
      loadSources();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "افزودن منبع با خطا مواجه شد.", "error");
    }
  }

  async function handleToggleSource(source: NewsSource) {
    try {
      await api.patch(`/news/sources/${source.id}`, { isActive: !source.isActive }, accessToken);
      loadSources();
    } catch {
      toast("تغییر وضعیت منبع با خطا مواجه شد.", "error");
    }
  }

  async function handleDiscover() {
    setDiscovering(true);
    try {
      const result = await api.post<{ sourceId: string; sourceName: string; discovered: number; error?: string }[]>("/news/discover", undefined, accessToken);
      const total = result.reduce((sum, r) => sum + r.discovered, 0);
      toast(`${total.toLocaleString("fa-IR")} خبر جدید از منابع فعال کشف شد.`, "success");
      if (status === "DISCOVERED") loadItems();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "بررسی منابع با خطا مواجه شد.", "error");
    } finally {
      setDiscovering(false);
    }
  }

  async function handleVerify() {
    setVerifying(true);
    try {
      const result = await api.post<{ verified: number; rejectedDuplicates: number }>("/news/verify", undefined, accessToken);
      toast(`${result.verified.toLocaleString("fa-IR")} خبر تأیید شد، ${result.rejectedDuplicates.toLocaleString("fa-IR")} خبر تکراری رد شد.`, "success");
      loadItems();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "بررسی صحت اخبار با خطا مواجه شد.", "error");
    } finally {
      setVerifying(false);
    }
  }

  async function handleGenerateDraft(id: string) {
    setGeneratingFor(id);
    try {
      await api.post(`/news/items/${id}/generate-draft`, undefined, accessToken);
      toast("پیش‌نویس خبر ساخته شد.", "success");
      loadItems();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "ساخت پیش‌نویس خبر با خطا مواجه شد.", "error");
    } finally {
      setGeneratingFor(null);
    }
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">اخبار برق (News Autopilot)</h1>

      <AdminHelp storageKey="news-autopilot">
        <p>این صفحه فقط از منابع RSS/Atom واقعی که خودتان اضافه می‌کنید خبر جمع‌آوری می‌کند — هیچ Scraping غیرمجاز یا bypass انجام نمی‌شود.</p>
        <p>مسیر هر خبر: کشف → تأیید صحت (حذف تکراری‌ها) → تولید پیش‌نویس با AI → بررسی و تأیید شما → انتشار در وبلاگ. هیچ خبری بدون تأیید شما منتشر نمی‌شود.</p>
        <p>AI هرگز چیزی را که منبع تأیید نکرده به خبر اضافه نمی‌کند؛ اگر ادعایی نامطمئن باشد، در «یادداشت اطمینان» علامت‌گذاری می‌شود.</p>
      </AdminHelp>

      <section className="mb-8 rounded-lg border border-border-color p-4">
        <h2 className="mb-3 font-bold">منابع خبری</h2>
        <div className="mb-3 space-y-1.5">
          {sources.length === 0 && <p className="text-sm text-foreground/50">هنوز منبعی اضافه نشده است.</p>}
          {sources.map((s) => (
            <div key={s.id} className="flex items-center justify-between rounded-lg border border-border-color p-2 text-sm">
              <div>
                <span className="font-bold">{s.name}</span>{" "}
                <span className="text-xs text-foreground/40" dir="ltr">
                  {s.feedUrl}
                </span>
                {s.category && <span className="ms-2 rounded-full bg-surface-2 px-2 py-0.5 text-[10px]">{s.category}</span>}
              </div>
              <button
                onClick={() => handleToggleSource(s)}
                className={`rounded-lg border px-2 py-1 text-xs ${s.isActive ? "border-green-500/40 text-green-500" : "border-border-color text-foreground/50"}`}
              >
                {s.isActive ? "فعال" : "غیرفعال"}
              </button>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            value={newSourceName}
            onChange={(e) => setNewSourceName(e.target.value)}
            placeholder="نام منبع"
            className="rounded-lg border border-border-color bg-background px-3 py-2 text-sm"
          />
          <input
            value={newSourceUrl}
            onChange={(e) => setNewSourceUrl(e.target.value)}
            placeholder="آدرس فید RSS/Atom"
            dir="ltr"
            className="min-w-[220px] flex-1 rounded-lg border border-border-color bg-background px-3 py-2 text-sm"
          />
          <input
            value={newSourceCategory}
            onChange={(e) => setNewSourceCategory(e.target.value)}
            placeholder="دسته‌بندی (اختیاری)"
            className="rounded-lg border border-border-color bg-background px-3 py-2 text-sm"
          />
          <button onClick={handleAddSource} className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-[#0b0e14]">
            افزودن منبع
          </button>
        </div>
        <div className="mt-3 flex gap-2">
          <button onClick={handleDiscover} disabled={discovering} className="rounded-lg border border-border-color px-4 py-2 text-sm disabled:opacity-50">
            {discovering ? "در حال بررسی..." : "بررسی منابع برای اخبار جدید"}
          </button>
          <button onClick={handleVerify} disabled={verifying} className="rounded-lg border border-border-color px-4 py-2 text-sm disabled:opacity-50">
            {verifying ? "در حال بررسی صحت..." : "بررسی صحت اخبار کشف‌شده"}
          </button>
        </div>
      </section>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {STATUS_TABS.map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium ${status === s ? "bg-brand text-[#0b0e14]" : "border border-border-color text-foreground/60"}`}
          >
            {STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      {items === null ? (
        <p className="text-sm text-foreground/50">در حال بارگذاری...</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-foreground/50">خبری در این وضعیت وجود ندارد.</p>
      ) : (
        <div className="space-y-1.5">
          {items.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-2 rounded-lg border border-border-color p-2 text-sm">
              <Link href={`/admin/news/${item.id}`} className="min-w-0 flex-1 hover:text-brand">
                <p className="line-clamp-1 font-bold">{item.draftTitle || item.rawTitle}</p>
                <p className="text-xs text-foreground/40">
                  {item.sourceName}
                  {item.category ? ` — ${item.category}` : ""}
                </p>
              </Link>
              {status === "VERIFIED" && (
                <button
                  onClick={() => handleGenerateDraft(item.id)}
                  disabled={generatingFor === item.id}
                  className="shrink-0 rounded-lg border border-border-color px-3 py-1 text-xs disabled:opacity-50"
                >
                  {generatingFor === item.id ? "در حال ساخت..." : "ساخت پیش‌نویس خبر"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
