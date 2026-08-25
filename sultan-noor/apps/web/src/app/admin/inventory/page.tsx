"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { InventoryForecastResult, InventoryRiskLevel, ReorderRecommendation } from "@/lib/types";
import AdminHelp from "@/components/admin/AdminHelp";

const RISK_LABEL: Record<InventoryRiskLevel, string> = {
  CRITICAL: "بحرانی",
  LOW: "کم",
  REVIEW: "نیازمند بررسی",
  NORMAL: "عادی",
};

const RISK_STYLE: Record<InventoryRiskLevel, string> = {
  CRITICAL: "bg-red-500/10 text-red-500",
  LOW: "bg-amber-500/10 text-amber-500",
  REVIEW: "bg-blue-500/10 text-blue-500",
  NORMAL: "bg-green-500/10 text-green-500",
};

const STATUS_LABEL: Record<ReorderRecommendation["status"], string> = {
  PENDING_REVIEW: "در انتظار بررسی",
  APPROVED: "تأیید شده",
  REJECTED: "رد شده",
  EXECUTED: "اجرا شده",
};

export default function InventoryPage() {
  const { accessToken } = useAuth();
  const { toast } = useToast();
  const [forecast, setForecast] = useState<InventoryForecastResult | null>(null);
  const [recommendations, setRecommendations] = useState<ReorderRecommendation[] | null>(null);
  const [statusFilter, setStatusFilter] = useState("PENDING_REVIEW");
  const [generating, setGenerating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  function loadForecast() {
    if (!accessToken) return;
    api.get<InventoryForecastResult>("/inventory/forecast", accessToken).then(setForecast);
  }
  function loadRecommendations() {
    if (!accessToken) return;
    const query = statusFilter ? `?status=${statusFilter}` : "";
    api.get<ReorderRecommendation[]>(`/inventory/reorder-recommendations${query}`, accessToken).then(setRecommendations);
  }

  useEffect(loadForecast, [accessToken]);
  useEffect(loadRecommendations, [accessToken, statusFilter]);

  async function handleGenerate() {
    setGenerating(true);
    try {
      await api.post("/inventory/reorder-recommendations/generate", undefined, accessToken);
      toast("پیشنهادهای تجدید موجودی به‌روزرسانی شد.", "success");
      loadRecommendations();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "به‌روزرسانی پیشنهادها ناموفق بود.", "error");
    } finally {
      setGenerating(false);
    }
  }

  async function handleApprove(id: string) {
    setBusyId(id);
    try {
      const result = await api.post<ReorderRecommendation>(`/inventory/reorder-recommendations/${id}/approve`, undefined, accessToken);
      toast(result.executionNote ?? "تأیید شد.", "success");
      loadRecommendations();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "تأیید ناموفق بود.", "error");
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject(id: string) {
    setBusyId(id);
    try {
      await api.post(`/inventory/reorder-recommendations/${id}/reject`, undefined, accessToken);
      toast("رد شد.", "success");
      loadRecommendations();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "رد ناموفق بود.", "error");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">پیش‌بینی موجودی و تجدید سفارش</h1>

      <AdminHelp storageKey="inventory-forecast">
        <p>پیش‌بینی فقط برای محصولاتی محاسبه می‌شود که فروش واقعی در بازه اخیر داشته‌اند — برای بقیه به‌جای حدس، «داده کافی نیست» نشان داده می‌شود.</p>
        <p>تأیید یک پیشنهاد هرگز به‌تنهایی سفارش خرید واقعی نمی‌سازد، مگر اینکه تامین‌کننده و هزینه واحد واقعی قبلی برای آن محصول ثبت شده باشد؛ در غیر این صورت باید دستی از بخش تامین‌کنندگان پیگیری شود.</p>
      </AdminHelp>

      <section className="mb-8">
        <h2 className="mb-3 font-bold">پیشنهادهای تجدید موجودی</h2>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-lg border border-border-color bg-background px-3 py-2 text-sm">
            <option value="PENDING_REVIEW">در انتظار بررسی</option>
            <option value="APPROVED">تأیید شده</option>
            <option value="REJECTED">رد شده</option>
            <option value="EXECUTED">اجرا شده</option>
            <option value="">همه</option>
          </select>
          <button onClick={handleGenerate} disabled={generating} className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-[#0b0e14] disabled:opacity-50">
            {generating ? "در حال بررسی..." : "بررسی موجودی و ساخت پیشنهاد جدید"}
          </button>
        </div>

        {recommendations === null ? (
          <p className="text-sm text-foreground/50">در حال بارگذاری...</p>
        ) : recommendations.length === 0 ? (
          <p className="text-sm text-foreground/50">پیشنهادی در این وضعیت وجود ندارد.</p>
        ) : (
          <div className="space-y-2">
            {recommendations.map((r) => (
              <div key={r.id} className="rounded-lg border border-border-color p-3 text-sm">
                <div className="flex items-center justify-between">
                  <p className="font-bold">{r.productName}</p>
                  <span className="rounded bg-foreground/10 px-2 py-0.5 text-xs">{STATUS_LABEL[r.status]}</span>
                </div>
                <p className="mt-1 text-xs text-foreground/60">{r.reasoning}</p>
                <p className="mt-1 text-xs text-foreground/60">
                  موجودی فعلی: {r.currentStock} — مقدار پیشنهادی: {r.suggestedQuantity}
                </p>
                {r.executionNote && <p className="mt-1 text-xs text-brand">{r.executionNote}</p>}
                {r.status === "PENDING_REVIEW" && (
                  <div className="mt-2 flex gap-2">
                    <button onClick={() => handleApprove(r.id)} disabled={busyId === r.id} className="rounded bg-green-500/10 px-3 py-1 text-xs font-bold text-green-500 disabled:opacity-50">
                      تأیید
                    </button>
                    <button onClick={() => handleReject(r.id)} disabled={busyId === r.id} className="rounded bg-red-500/10 px-3 py-1 text-xs font-bold text-red-500 disabled:opacity-50">
                      رد
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-bold">پیش‌بینی سطح موجودی</h2>
        {forecast === null ? (
          <p className="text-sm text-foreground/50">در حال بارگذاری...</p>
        ) : (
          <>
            <div className="overflow-x-auto rounded-lg border border-border-color">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-color text-right text-xs text-foreground/60">
                    <th className="p-2">محصول</th>
                    <th className="p-2">موجودی</th>
                    <th className="p-2">میانگین فروش روزانه</th>
                    <th className="p-2">روزهای باقی‌مانده</th>
                    <th className="p-2">ریسک</th>
                  </tr>
                </thead>
                <tbody>
                  {forecast.forecasts.map((f) => (
                    <tr key={f.productId} className="border-b border-border-color last:border-0">
                      <td className="p-2">{f.productName}</td>
                      <td className="p-2">{f.currentStock}</td>
                      <td className="p-2">{f.avgDailySales}</td>
                      <td className="p-2">{f.daysRemaining}</td>
                      <td className="p-2">
                        <span className={`rounded px-2 py-0.5 text-xs ${RISK_STYLE[f.riskLevel]}`}>{RISK_LABEL[f.riskLevel]}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {forecast.insufficientData.length > 0 && (
              <p className="mt-3 text-xs text-foreground/50">
                {forecast.insufficientData.length} محصول دیگر داده فروش کافی برای پیش‌بینی ندارند (بدون فروش واقعی در بازه اخیر).
              </p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
