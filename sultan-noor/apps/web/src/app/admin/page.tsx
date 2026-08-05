"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

interface Summary {
  totalOrders: number;
  totalRevenue: number;
  totalUsers: number;
  totalProducts: number;
  lowStockVariants: number;
  pendingReviews: number;
  ordersByStatus: { status: string; count: number }[];
}

export default function AdminDashboardPage() {
  const { accessToken } = useAuth();
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    api.get<Summary>("/dashboard/summary", accessToken).then(setSummary);
  }, [accessToken]);

  if (!summary) return <p>در حال بارگذاری...</p>;

  const cards = [
    { label: "تعداد سفارش‌ها", value: summary.totalOrders },
    { label: "درآمد کل (تومان)", value: Number(summary.totalRevenue).toLocaleString("fa-IR") },
    { label: "تعداد کاربران", value: summary.totalUsers },
    { label: "تعداد محصولات", value: summary.totalProducts },
    { label: "موجودی رو به اتمام", value: summary.lowStockVariants },
    { label: "نظرات در انتظار تایید", value: summary.pendingReviews },
  ];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">داشبورد فروش</h1>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {cards.map((c) => (
          <div key={c.label} className="rounded-lg border border-border-color bg-surface p-4">
            <p className="text-sm text-foreground/50">{c.label}</p>
            <p className="mt-1 text-xl font-extrabold text-brand">{c.value}</p>
          </div>
        ))}
      </div>

      <h2 className="mt-8 mb-3 font-bold">وضعیت سفارش‌ها</h2>
      <div className="space-y-1">
        {summary.ordersByStatus.map((s) => (
          <div key={s.status} className="flex justify-between rounded-lg border border-border-color p-2 text-sm">
            <span>{s.status}</span>
            <span className="font-bold">{s.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
