"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { AbandonedCartSummary, CrossSellPair, SalesAnalyticsOverview } from "@/lib/types";
import AdminHelp from "@/components/admin/AdminHelp";

interface LowStockOpportunity {
  productId: string;
  name: string;
  quantitySold: number;
  stockRemaining: number;
}

function toman(n: number): string {
  return `${Math.round(n).toLocaleString("fa-IR")} تومان`;
}

export default function SalesAnalyticsPage() {
  const { accessToken } = useAuth();
  const { toast } = useToast();
  const [overview, setOverview] = useState<SalesAnalyticsOverview | null>(null);
  const [lowStock, setLowStock] = useState<LowStockOpportunity[] | null>(null);
  const [crossSell, setCrossSell] = useState<CrossSellPair[] | null>(null);
  const [abandoned, setAbandoned] = useState<AbandonedCartSummary | null>(null);
  const [generating, setGenerating] = useState<string | null>(null);

  function load() {
    if (!accessToken) return;
    Promise.all([
      api.get<SalesAnalyticsOverview>("/sales/analytics", accessToken),
      api.get<LowStockOpportunity[]>("/sales/opportunities/low-stock-bestsellers", accessToken),
      api.get<CrossSellPair[]>("/sales/opportunities/cross-sell-pairs", accessToken),
      api.get<AbandonedCartSummary>("/sales/abandoned-carts", accessToken),
    ]).then(([o, l, c, a]) => {
      setOverview(o);
      setLowStock(l);
      setCrossSell(c);
      setAbandoned(a);
    });
  }

  useEffect(load, [accessToken]);

  async function generate(kind: "cross-sell" | "bundle" | "abandoned-cart") {
    setGenerating(kind);
    try {
      await api.post(`/sales/recommendations/${kind}/generate`, undefined, accessToken);
      toast("پیشنهاد ساخته شد — در «پیشنهادهای فروش» بررسی کنید.", "success");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "ساخت پیشنهاد با خطا مواجه شد.", "error");
    } finally {
      setGenerating(null);
    }
  }

  if (!overview) return <p className="text-sm text-foreground/50">در حال بارگذاری...</p>;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">تحلیل فروش (Sales Analytics)</h1>

      <AdminHelp storageKey="sales-analytics">
        <p>این صفحه فقط از داده واقعی سفارش‌ها، موجودی و سبدهای خرید فروشگاه ساخته می‌شود — هیچ عدد یا فرصتی جعل نمی‌شود.</p>
        <p>اگر برای شاخصی (مثل نرخ تبدیل یا بازدید محصول) داده واقعی در سیستم ثبت نمی‌شود، همان‌جا با عنوان «داده کافی موجود نیست» مشخص شده — چیزی حدس زده نمی‌شود.</p>
        <p>پیشنهادهای «فروش مرتبط» و «پک پیشنهادی» فقط از الگوهای واقعی خرید مشترک ساخته می‌شوند و بدون تأیید شما روی هیچ‌چیز اعمال نمی‌شوند.</p>
      </AdminHelp>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-border-color bg-surface p-4">
          <p className="text-sm text-foreground/50">فروش امروز</p>
          <p className="mt-1 text-xl font-extrabold text-brand">{toman(overview.today.revenue)}</p>
          <p className="mt-1 text-xs text-foreground/40">{overview.today.orderCount} سفارش</p>
        </div>
        <div className="rounded-lg border border-border-color bg-surface p-4">
          <p className="text-sm text-foreground/50">فروش این ماه</p>
          <p className="mt-1 text-xl font-extrabold text-brand">{toman(overview.thisMonth.revenue)}</p>
          <p className="mt-1 text-xs text-foreground/40">{overview.thisMonth.orderCount} سفارش</p>
        </div>
        <div className="rounded-lg border border-border-color bg-surface p-4">
          <p className="text-sm text-foreground/50">میانگین ارزش سفارش ({overview.window.days} روز)</p>
          <p className="mt-1 text-xl font-extrabold">{toman(overview.window.averageOrderValue)}</p>
        </div>
        <div className="rounded-lg border border-red-500/40 bg-red-500/5 p-4">
          <p className="text-sm text-red-500/80">سبدهای رهاشده</p>
          <p className="mt-1 text-xl font-extrabold text-red-500">{abandoned?.count ?? 0}</p>
          <p className="mt-1 text-xs text-red-500/70">{abandoned ? toman(abandoned.approximateValueToman) : ""}</p>
        </div>
      </div>

      {overview.dataGaps.length > 0 && (
        <div className="mb-6 rounded-lg border border-dashed border-amber-500/50 bg-amber-500/5 p-3 text-xs text-amber-500">
          {overview.dataGaps.map((g, i) => (
            <p key={i}>{g}</p>
          ))}
        </div>
      )}

      <div className="mb-8 grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 font-bold">پرفروش‌ترین محصولات ({overview.window.days} روز اخیر)</h2>
          {overview.bestSellersByRevenue.length === 0 ? (
            <p className="text-sm text-foreground/50">داده کافی موجود نیست.</p>
          ) : (
            <div className="space-y-1.5">
              {overview.bestSellersByRevenue.map((p) => (
                <div key={p.productId} className="flex items-center justify-between rounded-lg border border-border-color p-2 text-sm">
                  <span>{p.name}</span>
                  <span className="text-foreground/50">
                    {p.quantitySold} عدد — {toman(p.revenue)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-3 font-bold">کم‌فروش‌ترین محصولات منتشرشده</h2>
          {overview.worstSellers.length === 0 ? (
            <p className="text-sm text-foreground/50">داده کافی موجود نیست.</p>
          ) : (
            <div className="space-y-1.5">
              {overview.worstSellers.map((p) => (
                <div key={p.productId} className="flex items-center justify-between rounded-lg border border-border-color p-2 text-sm">
                  <span>{p.name}</span>
                  <span className="text-foreground/50">{p.quantitySold} عدد</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-3 font-bold">محصولات بدون فروش</h2>
          {overview.noSalesProducts.length === 0 ? (
            <p className="text-sm text-foreground/50">موردی وجود ندارد.</p>
          ) : (
            <div className="space-y-1.5">
              {overview.noSalesProducts.map((p) => (
                <div key={p.productId} className="rounded-lg border border-border-color p-2 text-sm">
                  {p.name}
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-3 font-bold">محصولات با کاهش فروش</h2>
          {overview.decliningSalesProducts.length === 0 ? (
            <p className="text-sm text-foreground/50">موردی وجود ندارد.</p>
          ) : (
            <div className="space-y-1.5">
              {overview.decliningSalesProducts.map((p) => (
                <Link
                  key={p.productId}
                  href={`/admin/sales-recommendations?productId=${p.productId}`}
                  className="flex items-center justify-between rounded-lg border border-amber-500/40 bg-amber-500/5 p-2 text-sm text-amber-500 hover:border-amber-500"
                >
                  <span>{p.name}</span>
                  <span>{Math.round(p.declinePercent * 100)}٪ کاهش</span>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold">موجودی بحرانی (پرفروش + کم‌موجود)</h2>
          </div>
          {!lowStock || lowStock.length === 0 ? (
            <p className="text-sm text-foreground/50">موردی وجود ندارد.</p>
          ) : (
            <div className="space-y-1.5">
              {lowStock.map((p) => (
                <div key={p.productId} className="flex items-center justify-between rounded-lg border border-red-500/40 bg-red-500/5 p-2 text-sm text-red-500">
                  <span>{p.name}</span>
                  <span>
                    {p.quantitySold} فروش / {p.stockRemaining} باقی‌مانده
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold">فرصت‌های فروش مرتبط (Cross-sell)</h2>
            <button
              onClick={() => generate("cross-sell")}
              disabled={generating === "cross-sell"}
              className="rounded-lg border border-border-color px-3 py-1 text-xs hover:border-brand hover:text-brand disabled:opacity-50"
            >
              {generating === "cross-sell" ? "در حال ساخت..." : "ساخت پیشنهاد"}
            </button>
          </div>
          {!crossSell || crossSell.length === 0 ? (
            <p className="text-sm text-foreground/50">الگوی خرید مشترک واقعی کافی یافت نشد.</p>
          ) : (
            <div className="space-y-1.5">
              {crossSell.map((p, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border border-border-color p-2 text-sm">
                  <span>
                    {p.productAName} + {p.productBName}
                  </span>
                  <span className="text-foreground/50">{p.coOccurrence} سفارش مشترک</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => generate("bundle")}
          disabled={generating === "bundle"}
          className="rounded-lg border border-border-color px-4 py-2 text-sm hover:border-brand hover:text-brand disabled:opacity-50"
        >
          {generating === "bundle" ? "در حال ساخت پک پیشنهادی..." : "ساخت پک پیشنهادی (Bundle)"}
        </button>
        {abandoned && abandoned.count > 0 && (
          <button
            onClick={() => generate("abandoned-cart")}
            disabled={generating === "abandoned-cart"}
            className="rounded-lg border border-border-color px-4 py-2 text-sm hover:border-brand hover:text-brand disabled:opacity-50"
          >
            {generating === "abandoned-cart" ? "در حال ساخت..." : "ساخت پیشنهاد برای سبدهای رهاشده"}
          </button>
        )}
        <Link href="/admin/sales-recommendations" className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-[#0b0e14]">
          مشاهده همه پیشنهادهای فروش
        </Link>
      </div>
    </div>
  );
}
