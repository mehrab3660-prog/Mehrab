"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { OwnerDailyReport, OwnerWeeklyReport } from "@/lib/types";
import AdminHelp from "@/components/admin/AdminHelp";

export default function OwnerReportPage() {
  const { accessToken } = useAuth();
  const { toast } = useToast();
  const [daily, setDaily] = useState<OwnerDailyReport | null>(null);
  const [weekly, setWeekly] = useState<OwnerWeeklyReport | null>(null);
  const [dailySummary, setDailySummary] = useState<string | null>(null);
  const [summarizing, setSummarizing] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    api.get<OwnerDailyReport>("/owner-report/daily", accessToken).then(setDaily);
    api.get<OwnerWeeklyReport>("/owner-report/weekly", accessToken).then(setWeekly);
  }, [accessToken]);

  async function handleAiSummary() {
    setSummarizing(true);
    try {
      const res = await api.post<{ summary: string }>("/owner-report/daily/ai-summary", undefined, accessToken);
      setDailySummary(res.summary);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "تولید خلاصه هوشمند ناموفق بود.", "error");
    } finally {
      setSummarizing(false);
    }
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">گزارش هوشمند امروز سلطان نور</h1>

      <AdminHelp storageKey="owner-report">
        <p>هر عدد این صفحه از داده واقعی فروشگاه محاسبه شده است. خلاصه هوشمند فقط همین اعداد را به زبان ساده توضیح می‌دهد و خودش هیچ عددی نمی‌سازد.</p>
      </AdminHelp>

      {daily === null ? (
        <p className="text-sm text-foreground/50">در حال بارگذاری...</p>
      ) : (
        <>
          <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-border-color p-4">
              <p className="text-xs text-foreground/60">فروش امروز</p>
              <p className="text-lg font-bold">{daily.sales.today.revenue.toLocaleString("fa-IR")} تومان</p>
            </div>
            <div className="rounded-lg border border-border-color p-4">
              <p className="text-xs text-foreground/60">تعداد سفارش امروز</p>
              <p className="text-lg font-bold">{daily.sales.today.orderCount}</p>
            </div>
            <div className="rounded-lg border border-border-color p-4">
              <p className="text-xs text-foreground/60">میانگین ارزش سفارش</p>
              <p className="text-lg font-bold">{Math.round(daily.sales.today.averageOrderValue).toLocaleString("fa-IR")} تومان</p>
            </div>
            <div className="rounded-lg border border-border-color p-4">
              <p className="text-xs text-foreground/60">سبدهای رهاشده</p>
              <p className="text-lg font-bold">{daily.abandonedCarts.count}</p>
            </div>
          </section>

          <section className="mb-6">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-bold">خلاصه هوشمند امروز</h2>
              <button onClick={handleAiSummary} disabled={summarizing} className="rounded-lg bg-brand px-4 py-2 text-xs font-bold text-[#0b0e14] disabled:opacity-50">
                {summarizing ? "در حال تولید..." : "تولید خلاصه هوشمند"}
              </button>
            </div>
            {dailySummary && <p className="rounded-lg border border-border-color p-3 text-sm text-foreground/80">{dailySummary}</p>}
          </section>

          {daily.importantIssues.length > 0 && (
            <section className="mb-6">
              <h2 className="mb-2 font-bold">مسائل مهم امروز</h2>
              <ul className="space-y-1 text-sm">
                {daily.importantIssues.map((issue, i) => (
                  <li key={i} className="rounded-lg border-r-4 border-amber-500 bg-amber-500/5 p-2">
                    {issue}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            <section>
              <h2 className="mb-2 font-bold">پرفروش‌ترین‌ها</h2>
              <ul className="space-y-1 text-sm text-foreground/70">
                {daily.sales.bestSellers.map((p) => (
                  <li key={p.productId}>
                    {p.name} — {p.quantitySold} عدد
                  </li>
                ))}
                {daily.sales.bestSellers.length === 0 && <li className="text-foreground/50">داده کافی نیست.</li>}
              </ul>
            </section>
            <section>
              <h2 className="mb-2 font-bold">کم‌فروش‌ترین‌ها</h2>
              <ul className="space-y-1 text-sm text-foreground/70">
                {daily.sales.worstSellers.map((p) => (
                  <li key={p.productId}>
                    {p.name} — {p.quantitySold} عدد
                  </li>
                ))}
                {daily.sales.worstSellers.length === 0 && <li className="text-foreground/50">داده کافی نیست.</li>}
              </ul>
            </section>
          </div>

          <section className="mt-6">
            <h2 className="mb-2 font-bold">گزارش هفتگی</h2>
            {weekly?.comparisonAvailable ? (
              <div className="rounded-lg border border-border-color p-4 text-sm">
                <p>فروش این هفته: {weekly.thisWeek.revenue.toLocaleString("fa-IR")} تومان</p>
                <p>فروش هفته گذشته: {weekly.lastWeek.revenue.toLocaleString("fa-IR")} تومان</p>
                <p className="mt-1 font-bold">
                  تغییر: {weekly.revenueChangePercent !== null ? `${weekly.revenueChangePercent}%` : "—"}
                </p>
              </div>
            ) : (
              <p className="text-sm text-foreground/50">{weekly?.note ?? "در حال بارگذاری..."}</p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
