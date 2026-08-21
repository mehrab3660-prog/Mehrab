"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { CustomerInsights, CustomerSegment, CustomerSummary } from "@/lib/types";
import AdminHelp from "@/components/admin/AdminHelp";

const SEGMENT_LABEL: Record<CustomerSegment, string> = {
  B2B: "عمده‌فروش",
  NEW: "مشتری جدید",
  LOYAL: "وفادار",
  ACTIVE: "فعال",
  LOW_ACTIVITY: "کم‌تحرک",
  INACTIVE: "غیرفعال",
  NO_ORDERS: "بدون سفارش",
};

const SEGMENT_STYLE: Record<CustomerSegment, string> = {
  B2B: "bg-purple-500/10 text-purple-500",
  NEW: "bg-blue-500/10 text-blue-500",
  LOYAL: "bg-green-500/10 text-green-500",
  ACTIVE: "bg-brand/10 text-brand",
  LOW_ACTIVITY: "bg-amber-500/10 text-amber-500",
  INACTIVE: "bg-red-500/10 text-red-500",
  NO_ORDERS: "bg-foreground/10 text-foreground/50",
};

export default function CrmPage() {
  const { accessToken } = useAuth();
  const [counts, setCounts] = useState<Record<CustomerSegment, number> | null>(null);
  const [segmentFilter, setSegmentFilter] = useState<CustomerSegment | "">("");
  const [customers, setCustomers] = useState<{ items: CustomerSummary[]; total: number } | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [insights, setInsights] = useState<CustomerInsights | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    api.get<Record<CustomerSegment, number>>("/crm/segments", accessToken).then(setCounts);
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) return;
    const query = segmentFilter ? `?segment=${segmentFilter}` : "";
    api.get<{ items: CustomerSummary[]; total: number }>(`/crm/customers${query}`, accessToken).then(setCustomers);
  }, [accessToken, segmentFilter]);

  useEffect(() => {
    if (!accessToken || !selectedUserId) {
      setInsights(null);
      return;
    }
    api.get<CustomerInsights>(`/crm/customers/${selectedUserId}`, accessToken).then(setInsights);
  }, [accessToken, selectedUserId]);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">مدیریت هوشمند مشتریان (CRM)</h1>

      <AdminHelp storageKey="crm">
        <p>بخش‌بندی مشتریان فقط از روی سفارش‌های واقعی و پرداخت‌شده محاسبه می‌شود — هرگز حدس زده نمی‌شود.</p>
        <p>برآورد «خرید بعدی» فقط وقتی نشان داده می‌شود که مشتری حداقل ۳ سفارش واقعی داشته باشد؛ در غیر این صورت صادقانه «داده کافی نیست» نمایش داده می‌شود.</p>
      </AdminHelp>

      {counts && (
        <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {(Object.keys(SEGMENT_LABEL) as CustomerSegment[]).map((seg) => (
            <button
              key={seg}
              onClick={() => setSegmentFilter(segmentFilter === seg ? "" : seg)}
              className={`rounded-lg border p-3 text-center transition ${segmentFilter === seg ? "border-brand" : "border-border-color"}`}
            >
              <p className="text-xl font-bold">{counts[seg]}</p>
              <p className="text-xs text-foreground/60">{SEGMENT_LABEL[seg]}</p>
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 font-bold">مشتریان {customers ? `(${customers.total})` : ""}</h2>
          {customers === null ? (
            <p className="text-sm text-foreground/50">در حال بارگذاری...</p>
          ) : customers.items.length === 0 ? (
            <p className="text-sm text-foreground/50">مشتری‌ای در این بخش وجود ندارد.</p>
          ) : (
            <div className="space-y-2">
              {customers.items.map((c) => (
                <button
                  key={c.userId}
                  onClick={() => setSelectedUserId(c.userId)}
                  className={`flex w-full items-center justify-between rounded-lg border p-3 text-right text-sm transition hover:border-brand ${selectedUserId === c.userId ? "border-brand" : "border-border-color"}`}
                >
                  <div>
                    <p className="font-bold">{c.fullName ?? "بدون نام"}</p>
                    <p className="text-xs text-foreground/50">{c.phone}</p>
                  </div>
                  <div className="text-left">
                    <span className={`rounded px-2 py-0.5 text-xs ${SEGMENT_STYLE[c.segment]}`}>{SEGMENT_LABEL[c.segment]}</span>
                    <p className="mt-1 text-xs text-foreground/50">{c.orderCount} سفارش</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-3 font-bold">جزئیات مشتری</h2>
          {!selectedUserId ? (
            <p className="text-sm text-foreground/50">یک مشتری را از فهرست انتخاب کنید.</p>
          ) : insights === null ? (
            <p className="text-sm text-foreground/50">در حال بارگذاری...</p>
          ) : (
            <div className="space-y-4 rounded-lg border border-border-color p-4 text-sm">
              <div>
                <p className="font-bold">{insights.fullName ?? "بدون نام"}</p>
                <p className="text-xs text-foreground/50">{insights.phone}</p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <p>تعداد سفارش واقعی: {insights.orderCount}</p>
                <p>مجموع خرید: {insights.totalSpend.toLocaleString("fa-IR")} تومان</p>
                <p>آخرین خرید: {insights.lastOrderAt ? new Date(insights.lastOrderAt).toLocaleDateString("fa-IR") : "—"}</p>
                <p>بخش: {SEGMENT_LABEL[insights.segment]}</p>
              </div>
              <div>
                <p className="mb-1 font-bold">برآورد خرید بعدی</p>
                {insights.predictionAvailable ? (
                  <p className="text-xs text-foreground/70">{insights.nextPurchaseEstimate ? new Date(insights.nextPurchaseEstimate).toLocaleDateString("fa-IR") : "—"}</p>
                ) : (
                  <p className="text-xs text-foreground/50">{insights.predictionNote}</p>
                )}
              </div>
              {insights.frequentProducts.length > 0 && (
                <div>
                  <p className="mb-1 font-bold">محصولات پرتکرار خرید</p>
                  <ul className="space-y-1 text-xs text-foreground/70">
                    {insights.frequentProducts.slice(0, 5).map((p) => (
                      <li key={p.productId}>
                        {p.name} — {p.quantity} عدد
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
