"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { AiControlCenterData } from "@/lib/types";
import AdminHelp from "@/components/admin/AdminHelp";

const ACTION_LABEL: Record<string, string> = {
  "ai_product.prepare": "آماده‌سازی پیش‌نویس محصول",
  "ai_product.edit": "ویرایش پیش‌نویس محصول",
  "ai_product.approve": "تأیید محصول",
  "ai_product.reject": "رد پیش‌نویس محصول",
  "ai_image.search": "جستجوی تصویر",
  "ai_image.search_skipped": "رد شدن جستجوی تصویر (بودجه)",
  "ai_image.candidate_rejected": "رد کاندید تصویر",
  "ai_image.background_removed": "حذف پس‌زمینه تصویر",
  "ai_image.ai_generated": "تولید تصویر با هوش مصنوعی",
  "ai_image.generation_skipped": "رد شدن تولید تصویر (بودجه)",
  "ai_image.generation_failed": "خطا در تولید تصویر",
  "ai_image.generation_rejected": "رد تصویر تولیدشده (نامعتبر)",
  "ai_image.approved": "تأیید تصویر",
  "ai_image.rejected": "رد تصویر",
  "ai_image.set_main": "انتخاب تصویر اصلی",
  "ai_image.regenerated": "بازتولید تصویر",
  "ai_image.manual_upload": "بارگذاری دستی تصویر",
  "ai_image.published": "انتشار تصاویر محصول",
  "ai_image.none_available": "عدم موفقیت تصویر خودکار",
  "ai_image.autopilot_failed": "خطای غیرمنتظره در تصویر خودکار",
  "seo.suggestion_generated": "ساخت پیشنهاد سئو",
  "seo.suggestion_edited": "ویرایش پیشنهاد سئو",
  "seo.suggestion_approved": "تأیید پیشنهاد سئو",
  "seo.suggestion_rejected": "رد پیشنهاد سئو",
  "seo.auto_fix_applied": "اصلاح خودکار سئو (کم‌ریسک)",
  "content.generated": "تولید محتوا",
  "content.edited": "ویرایش محتوا",
  "content.approved_as_draft": "تأیید محتوا به‌عنوان پیش‌نویس",
  "content.published": "انتشار محتوا",
  "content.rejected": "رد محتوا",
  "sales.discount_generated": "ساخت پیشنهاد تخفیف",
  "sales.campaign_generated": "ساخت پیشنهاد کمپین",
  "sales.recommendation_edited": "ویرایش پیشنهاد فروش",
  "sales.recommendation_approved": "تأیید پیشنهاد فروش",
  "sales.recommendation_rejected": "رد پیشنهاد فروش",
  "sales.campaign_activated": "فعال‌سازی کمپین",
  "news.discovery_run": "بررسی منابع خبری",
  "news.draft_generated": "تولید پیش‌نویس خبر",
  "news.edited": "ویرایش خبر",
  "news.approved": "تأیید خبر",
  "news.rejected": "رد خبر",
  "news.published": "انتشار خبر",
  "consultant.rule_created": "افزودن قانون مشاور برق",
  "consultant.rule_updated": "ویرایش قانون مشاور برق",
  "consultant.rule_removed": "حذف قانون مشاور برق",
};

function actionLabel(action: string): string {
  return ACTION_LABEL[action] ?? action;
}

export default function AiControlCenterPage() {
  const { accessToken } = useAuth();
  const [data, setData] = useState<AiControlCenterData | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    api.get<AiControlCenterData>("/dashboard/ai-control-center", accessToken).then(setData);
  }, [accessToken]);

  if (!data) return <p className="text-sm text-foreground/50">در حال بارگذاری...</p>;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">مرکز کنترل هوش مصنوعی</h1>

      <AdminHelp storageKey="ai-control-center">
        <p>این صفحه فقط چیزهایی را نشان می‌دهد که همین الان در فروشگاه واقعی وجود دارند و احتمالاً باید یک نگاه به آن‌ها بیندازید — چیزی حدس زده یا ساخته نمی‌شود.</p>
        <p>«پیش‌نویس‌های در انتظار تأیید» یعنی هوش مصنوعی یک محصول آماده کرده و منتظر بررسی و تأیید شماست. «نیاز به بررسی» یعنی تصویر خودکار برای آن‌ها آماده نشده.</p>
        <p>«لاگ فعالیت هوش مصنوعی» فقط یک گزارش خواندنی است؛ برای جزئیات کامل به «لاگ فعالیت» در منو بروید.</p>
      </AdminHelp>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-border-color bg-surface p-4">
          <p className="text-sm text-foreground/50">پیش‌نویس در انتظار تأیید</p>
          <p className="mt-1 text-xl font-extrabold text-brand">{data.pendingDraftsCount}</p>
        </div>
        <div className="rounded-lg border border-border-color bg-surface p-4">
          <p className="text-sm text-foreground/50">نیاز به بررسی تصویر</p>
          <p className="mt-1 text-xl font-extrabold text-amber-500">{data.draftsNeedingAttention.length}</p>
        </div>
        <div className="rounded-lg border border-border-color bg-surface p-4">
          <p className="text-sm text-foreground/50">سوال بی‌پاسخ</p>
          <p className="mt-1 text-xl font-extrabold text-brand">{data.unansweredQuestions.length}</p>
        </div>
        <div className="rounded-lg border border-border-color bg-surface p-4">
          <p className="text-sm text-foreground/50">موجودی رو به اتمام</p>
          <p className="mt-1 text-xl font-extrabold text-red-500">{data.lowStockVariants.length}</p>
        </div>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link href="/admin/seo" className="rounded-lg border border-red-500/40 bg-red-500/5 p-4 hover:border-red-500">
          <p className="text-sm text-red-500/80">مشکلات سئو</p>
          <p className="mt-1 text-xl font-extrabold text-red-500">{data.seoProblemsCount}</p>
          <p className="mt-1 text-xs text-red-500/70">
            بالا: {data.seoProblemsBySeverity.HIGH} — متوسط: {data.seoProblemsBySeverity.MEDIUM} — پایین: {data.seoProblemsBySeverity.LOW}
          </p>
        </Link>
        <Link href="/admin/seo" className="rounded-lg border border-border-color bg-surface p-4 hover:border-brand">
          <p className="text-sm text-foreground/50">پیشنهاد سئو در انتظار تأیید</p>
          <p className="mt-1 text-xl font-extrabold text-brand">{data.pendingSeoSuggestions.length}</p>
        </Link>
        <Link href="/admin/content" className="rounded-lg border border-border-color bg-surface p-4 hover:border-brand">
          <p className="text-sm text-foreground/50">محتوای در انتظار تأیید</p>
          <p className="mt-1 text-xl font-extrabold text-brand">{data.pendingContentDrafts.length}</p>
        </Link>
        <div className="rounded-lg border border-border-color bg-surface p-4">
          <p className="text-sm text-foreground/50">محصولات بدون سئو کامل</p>
          <p className="mt-1 text-xl font-extrabold text-amber-500">{data.productsNeedingSeoCount}</p>
        </div>
      </div>

      <div className="mb-6 rounded-lg border border-border-color bg-surface p-4">
        <p className="text-sm text-foreground/50">هزینه تخمینی هوش مصنوعی (سئو، محتوا و فروش) — این ماه</p>
        <p className="mt-1 text-xl font-extrabold">{data.aiUsageCostThisMonthToman.toLocaleString("fa-IR")} تومان</p>
      </div>

      <h2 className="mb-3 mt-2 font-bold">فروش</h2>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link href="/admin/sales-analytics" className="rounded-lg border border-border-color bg-surface p-4 hover:border-brand">
          <p className="text-sm text-foreground/50">فروش امروز</p>
          <p className="mt-1 text-xl font-extrabold text-brand">{Math.round(data.salesToday.revenue).toLocaleString("fa-IR")} تومان</p>
          <p className="mt-1 text-xs text-foreground/40">{data.salesToday.orderCount} سفارش</p>
        </Link>
        <Link href="/admin/sales-analytics" className="rounded-lg border border-border-color bg-surface p-4 hover:border-brand">
          <p className="text-sm text-foreground/50">فروش این ماه</p>
          <p className="mt-1 text-xl font-extrabold text-brand">{Math.round(data.salesThisMonth.revenue).toLocaleString("fa-IR")} تومان</p>
          <p className="mt-1 text-xs text-foreground/40">میانگین سفارش: {Math.round(data.salesThisMonth.averageOrderValue).toLocaleString("fa-IR")} تومان</p>
        </Link>
        <Link href="/admin/sales-analytics" className="rounded-lg border border-red-500/40 bg-red-500/5 p-4 hover:border-red-500">
          <p className="text-sm text-red-500/80">موجودی بحرانی (پرفروش + کم‌موجود)</p>
          <p className="mt-1 text-xl font-extrabold text-red-500">{data.criticalStockOpportunities.length}</p>
        </Link>
        <Link href="/admin/sales-analytics" className="rounded-lg border border-border-color bg-surface p-4 hover:border-brand">
          <p className="text-sm text-foreground/50">سبدهای خرید رهاشده</p>
          <p className="mt-1 text-xl font-extrabold text-amber-500">{data.abandonedCarts.count}</p>
          <p className="mt-1 text-xs text-foreground/40">{Math.round(data.abandonedCarts.approximateValueToman).toLocaleString("fa-IR")} تومان</p>
        </Link>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link href="/admin/sales-analytics" className="rounded-lg border border-border-color bg-surface p-4 hover:border-brand">
          <p className="text-sm text-foreground/50">فرصت‌های فروش مرتبط (Cross-sell)</p>
          <p className="mt-1 text-xl font-extrabold text-brand">{data.crossSellOpportunityCount}</p>
        </Link>
        <Link href="/admin/sales-analytics" className="rounded-lg border border-border-color bg-surface p-4 hover:border-brand">
          <p className="text-sm text-foreground/50">فرصت‌های پک پیشنهادی (Bundle)</p>
          <p className="mt-1 text-xl font-extrabold text-brand">{data.bundleOpportunityCount}</p>
        </Link>
        <Link href="/admin/sales-recommendations" className="rounded-lg border border-border-color bg-surface p-4 hover:border-brand">
          <p className="text-sm text-foreground/50">پیشنهادهای AI در انتظار تأیید</p>
          <p className="mt-1 text-xl font-extrabold text-brand">{data.pendingSalesRecommendations.length}</p>
        </Link>
      </div>

      <h2 className="mb-3 mt-2 font-bold">اخبار برق (News Autopilot)</h2>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link href="/admin/news" className="rounded-lg border border-border-color bg-surface p-4 hover:border-brand">
          <p className="text-sm text-foreground/50">خبر در انتظار بررسی</p>
          <p className="mt-1 text-xl font-extrabold text-brand">{data.news.pendingReviewCount}</p>
        </Link>
        <Link href="/admin/news" className="rounded-lg border border-border-color bg-surface p-4 hover:border-brand">
          <p className="text-sm text-foreground/50">خبر کشف‌شده (بررسی‌نشده)</p>
          <p className="mt-1 text-xl font-extrabold">{data.news.discoveredCount}</p>
        </Link>
        <Link href="/admin/news" className="rounded-lg border border-border-color bg-surface p-4 hover:border-brand">
          <p className="text-sm text-foreground/50">خبر منتشرشده (کل)</p>
          <p className="mt-1 text-xl font-extrabold text-green-500">{data.news.publishedCount}</p>
        </Link>
        <div className="rounded-lg border border-border-color bg-surface p-4">
          <p className="text-sm text-foreground/50">هزینه AI اخبار — این ماه</p>
          <p className="mt-1 text-xl font-extrabold">{data.news.aiCostThisMonthToman.toLocaleString("fa-IR")} تومان</p>
          {data.news.aiErrorsThisMonth > 0 && <p className="mt-1 text-xs text-red-500">{data.news.aiErrorsThisMonth} خطای AI</p>}
        </div>
      </div>

      <h2 className="mb-3 mt-2 font-bold">دستیار فروش هوشمند فروشگاه (Store-only AI)</h2>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-border-color bg-surface p-4">
          <p className="text-sm text-foreground/50">درخواست محصول — این ماه</p>
          <p className="mt-1 text-xl font-extrabold text-brand">{data.storeAi.productQueriesThisMonth}</p>
        </div>
        <div className="rounded-lg border border-border-color bg-surface p-4">
          <p className="text-sm text-foreground/50">جستجوی موفق</p>
          <p className="mt-1 text-xl font-extrabold text-green-500">{data.storeAi.searchSuccessThisMonth}</p>
        </div>
        <div className="rounded-lg border border-border-color bg-surface p-4">
          <p className="text-sm text-foreground/50">جستجوی بدون نتیجه</p>
          <p className="mt-1 text-xl font-extrabold text-amber-500">{data.storeAi.noResultSearchesThisMonth}</p>
        </div>
        <div className="rounded-lg border border-border-color bg-surface p-4">
          <p className="text-sm text-foreground/50">افزودن به سبد از طریق چت</p>
          <p className="mt-1 text-xl font-extrabold text-brand">{data.storeAi.addToCartThisMonth}</p>
        </div>
      </div>
      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-border-color bg-surface p-4">
          <p className="text-sm text-foreground/50">هزینه استدلال AI فروشگاه — این ماه</p>
          <p className="mt-1 text-xl font-extrabold">{data.storeAi.aiCostThisMonthToman.toLocaleString("fa-IR")} تومان</p>
          {data.storeAi.aiErrorsThisMonth > 0 && <p className="mt-1 text-xs text-red-500">{data.storeAi.aiErrorsThisMonth} خطای AI</p>}
        </div>
        <div className="rounded-lg border border-border-color bg-surface p-4">
          <p className="text-sm text-foreground/50">نرخ تبدیل افزودن‌به‌سبد از چت (فقط کاربران واردشده)</p>
          {data.storeAi.conversion ? (
            <p className="mt-1 text-xl font-extrabold text-brand">
              {(data.storeAi.conversion.rate * 100).toFixed(0)}٪{" "}
              <span className="text-xs font-normal text-foreground/40">
                ({data.storeAi.conversion.converted} از {data.storeAi.conversion.trackableClicks})
              </span>
            </p>
          ) : (
            <p className="mt-1 text-xs text-foreground/40">هنوز داده کافی برای محاسبه نرخ تبدیل وجود ندارد.</p>
          )}
        </div>
      </div>

      <h2 className="mb-3 mt-2 font-bold">مشاور هوشمند برق ساختمان (Smart Electrical Consultant)</h2>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link href="/admin/consultant-rules" className="rounded-lg border border-border-color bg-surface p-4 hover:border-brand">
          <p className="text-sm text-foreground/50">مشاوره شروع‌شده — این ماه</p>
          <p className="mt-1 text-xl font-extrabold text-brand">{data.consultant.consultationsStartedThisMonth}</p>
        </Link>
        <div className="rounded-lg border border-border-color bg-surface p-4">
          <p className="text-sm text-foreground/50">مشاوره تکمیل‌شده (لیست ساخته‌شده)</p>
          <p className="mt-1 text-xl font-extrabold text-green-500">{data.consultant.consultationsCompletedThisMonth}</p>
        </div>
        <div className="rounded-lg border border-border-color bg-surface p-4">
          <p className="text-sm text-foreground/50">افزودن به سبد از مشاور</p>
          <p className="mt-1 text-xl font-extrabold text-brand">{data.consultant.addToCartThisMonth}</p>
        </div>
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
          <p className="text-sm text-amber-500/80">درخواست بدون محصول مناسب</p>
          <p className="mt-1 text-xl font-extrabold text-amber-500">{data.consultant.noMatchRequestsThisMonth}</p>
        </div>
      </div>
      {data.consultant.mostSuggestedProducts.length > 0 && (
        <div className="mb-6 rounded-lg border border-border-color p-4">
          <p className="mb-2 text-sm font-bold">محصولات پرتکرار در پیشنهادهای مشاور</p>
          <div className="flex flex-wrap gap-1.5">
            {data.consultant.mostSuggestedProducts.map((p) => (
              <span key={p.productId} className="rounded-full bg-surface-2 px-2.5 py-1 text-xs">
                {p.name} × {p.count}
              </span>
            ))}
          </div>
        </div>
      )}

      {data.salesDataGaps.length > 0 && (
        <div className="mb-6 rounded-lg border border-dashed border-amber-500/50 bg-amber-500/5 p-3 text-xs text-amber-500">
          {data.salesDataGaps.map((g, i) => (
            <p key={i}>{g}</p>
          ))}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 font-bold">پیش‌نویس‌های در انتظار تأیید</h2>
          {data.pendingDrafts.length === 0 ? (
            <p className="text-sm text-foreground/50">موردی وجود ندارد.</p>
          ) : (
            <div className="space-y-1.5">
              {data.pendingDrafts.map((d) => (
                <Link key={d.id} href={`/admin/ai-products/${d.id}`} className="block rounded-lg border border-border-color p-2 text-sm hover:border-brand">
                  {d.name}
                </Link>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-3 font-bold">پیش‌نویس‌هایی که نیاز به بررسی تصویر دارند</h2>
          {data.draftsNeedingAttention.length === 0 ? (
            <p className="text-sm text-foreground/50">موردی وجود ندارد.</p>
          ) : (
            <div className="space-y-1.5">
              {data.draftsNeedingAttention.map((d) => (
                <Link key={d.id} href={`/admin/ai-products/${d.id}`} className="block rounded-lg border border-dashed border-amber-500/50 bg-amber-500/5 p-2 text-sm text-amber-500 hover:border-amber-500">
                  {d.name} — {d.imageAutopilotNote}
                </Link>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-3 font-bold">سوالات بی‌پاسخ مشتریان</h2>
          {data.unansweredQuestions.length === 0 ? (
            <p className="text-sm text-foreground/50">موردی وجود ندارد.</p>
          ) : (
            <div className="space-y-1.5">
              {data.unansweredQuestions.map((q) => (
                <Link key={q.id} href="/admin/qa" className="block rounded-lg border border-border-color p-2 text-sm hover:border-brand">
                  <span className="font-bold">{q.product.name}</span> — {q.body}
                </Link>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-3 font-bold">محصولات با موجودی کم</h2>
          {data.lowStockVariants.length === 0 ? (
            <p className="text-sm text-foreground/50">موردی وجود ندارد.</p>
          ) : (
            <div className="space-y-1.5">
              {data.lowStockVariants.map((s) => (
                <Link key={s.sku} href="/admin/warehouses" className="flex items-center justify-between rounded-lg border border-border-color p-2 text-sm hover:border-brand">
                  <span>
                    {s.productName} <span className="text-foreground/40">({s.sku})</span>
                  </span>
                  <span className="font-bold text-red-500">{s.quantity} عدد</span>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-3 font-bold">پیشنهادهای سئو در انتظار تأیید</h2>
          {data.pendingSeoSuggestions.length === 0 ? (
            <p className="text-sm text-foreground/50">موردی وجود ندارد.</p>
          ) : (
            <div className="space-y-1.5">
              {data.pendingSeoSuggestions.map((s) => (
                <Link key={s.id} href={`/admin/seo/${s.id}`} className="block rounded-lg border border-border-color p-2 text-sm hover:border-brand">
                  {s.productName}
                </Link>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-3 font-bold">محتوای در انتظار تأیید</h2>
          {data.pendingContentDrafts.length === 0 ? (
            <p className="text-sm text-foreground/50">موردی وجود ندارد.</p>
          ) : (
            <div className="space-y-1.5">
              {data.pendingContentDrafts.map((c) => (
                <Link key={c.id} href={`/admin/content/${c.id}`} className="block rounded-lg border border-border-color p-2 text-sm hover:border-brand">
                  {c.title || c.topic}
                </Link>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-3 font-bold">پیشنهادهای فروش در انتظار تأیید</h2>
          {data.pendingSalesRecommendations.length === 0 ? (
            <p className="text-sm text-foreground/50">موردی وجود ندارد.</p>
          ) : (
            <div className="space-y-1.5">
              {data.pendingSalesRecommendations.map((r) => (
                <Link
                  key={r.id}
                  href={`/admin/sales-recommendations/${r.id}`}
                  className={`block rounded-lg border p-2 text-sm hover:border-brand ${
                    r.severity === "CRITICAL" || r.severity === "HIGH" ? "border-red-500/40 bg-red-500/5 text-red-500" : "border-border-color"
                  }`}
                >
                  {r.title}
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="mt-6">
        <h2 className="mb-3 font-bold">لاگ فعالیت هوش مصنوعی (اخیر)</h2>
        {data.recentAiActivity.length === 0 ? (
          <p className="text-sm text-foreground/50">هنوز فعالیتی ثبت نشده است.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border-color">
            <table className="w-full text-sm">
              <tbody>
                {data.recentAiActivity.map((a, i) => (
                  <tr key={i} className="border-b border-border-color last:border-0">
                    <td className="p-2">{actionLabel(a.action)}</td>
                    <td className="p-2 text-foreground/50">{a.user?.fullName ?? a.user?.phone ?? "سیستم"}</td>
                    <td className="p-2 text-left text-xs text-foreground/40" dir="ltr">
                      {new Date(a.createdAt).toLocaleString("fa-IR")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
