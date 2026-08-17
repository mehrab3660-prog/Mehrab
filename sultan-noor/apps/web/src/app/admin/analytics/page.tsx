"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

interface Report {
  range: { from: string; to: string };
  summary: { totalRevenue: number; totalOrders: number; averageOrderValue: number; uniqueCustomers: number };
  revenueByDay: { date: string; total: number }[];
  topProducts: { productId: string; name: string; quantitySold: number; revenue: number }[];
  revenueByCategory: { categoryName: string; revenue: number }[];
  customerSegments: { customerType: string; orders: number; revenue: number }[];
  ordersByStatus: { status: string; count: number }[];
}

const STATUS_LABEL: Record<string, string> = {
  PENDING_PAYMENT: "در انتظار پرداخت",
  PROCESSING: "در حال پردازش",
  SHIPPED: "ارسال شده",
  DELIVERED: "تحویل داده شده",
  CANCELLED: "لغو شده",
  REFUNDED: "بازگشت وجه",
};

const SEGMENT_LABEL: Record<string, string> = { RETAIL: "خرده‌فروشی", WHOLESALE: "عمده‌فروشی" };

function toman(value: number) {
  return `${Math.round(value).toLocaleString("fa-IR")} تومان`;
}

function isoDateInputValue(iso: string) {
  return iso.slice(0, 10);
}

function csvCell(value: string | number) {
  const str = String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function downloadReportCsv(report: Report) {
  const lines: string[] = [];
  lines.push("خلاصه");
  lines.push("درآمد کل,تعداد سفارش,میانگین ارزش سفارش,مشتریان یکتا");
  lines.push(
    [report.summary.totalRevenue, report.summary.totalOrders, Math.round(report.summary.averageOrderValue), report.summary.uniqueCustomers]
      .map(csvCell)
      .join(","),
  );
  lines.push("");
  lines.push("پرفروش‌ترین محصولات");
  lines.push("نام محصول,تعداد فروش,درآمد");
  report.topProducts.forEach((p) => lines.push([p.name, p.quantitySold, p.revenue].map(csvCell).join(",")));
  lines.push("");
  lines.push("درآمد به تفکیک دسته‌بندی");
  lines.push("دسته‌بندی,درآمد");
  report.revenueByCategory.forEach((c) => lines.push([c.categoryName, c.revenue].map(csvCell).join(",")));
  lines.push("");
  lines.push("درآمد روزانه");
  lines.push("تاریخ,درآمد");
  report.revenueByDay.forEach((d) => lines.push([d.date, d.total].map(csvCell).join(",")));

  const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `گزارش-فروش-${isoDateInputValue(report.range.from)}-تا-${isoDateInputValue(report.range.to)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export default function AdminAnalyticsPage() {
  const { accessToken } = useAuth();
  const [report, setReport] = useState<Report | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  function load() {
    if (!accessToken) return;
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    api.get<Report>(`/dashboard/report${params.toString() ? `?${params}` : ""}`, accessToken).then((r) => {
      setReport(r);
      if (!from) setFrom(isoDateInputValue(r.range.from));
      if (!to) setTo(isoDateInputValue(r.range.to));
    });
  }

  // Only auto-loads on mount/login — changing the date pickers waits for the
  // "اعمال" button so the report doesn't re-fetch on every keystroke.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [accessToken]);

  if (!report) return <p>در حال بارگذاری...</p>;

  const maxDayRevenue = Math.max(1, ...report.revenueByDay.map((d) => d.total));
  const maxCategoryRevenue = Math.max(1, ...report.revenueByCategory.map((c) => c.revenue));

  const cards = [
    { label: "درآمد کل بازه", value: toman(report.summary.totalRevenue) },
    { label: "تعداد سفارش‌های واقعی", value: report.summary.totalOrders.toLocaleString("fa-IR") },
    { label: "میانگین ارزش سفارش", value: toman(report.summary.averageOrderValue) },
    { label: "مشتریان یکتا", value: report.summary.uniqueCustomers.toLocaleString("fa-IR") },
  ];

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">گزارش پیشرفته فروش</h1>
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-lg border border-border-color bg-background px-2 py-1 text-sm" />
          <span className="text-sm text-foreground/50">تا</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-lg border border-border-color bg-background px-2 py-1 text-sm" />
          <button onClick={load} className="rounded-lg bg-brand px-3 py-1 text-sm font-bold text-[#0b0e14]">
            اعمال
          </button>
          <button onClick={() => downloadReportCsv(report)} className="rounded-lg border border-border-color px-3 py-1 text-sm hover:border-brand hover:text-brand">
            خروجی CSV
          </button>
        </div>
      </div>

      <p className="mb-4 text-xs text-foreground/40">
        فقط سفارش‌های واقعاً پردازش‌شده (در حال پردازش، ارسال‌شده، تحویل‌داده‌شده) در محاسبه‌ی درآمد لحاظ می‌شوند.
      </p>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-lg border border-border-color bg-surface p-4">
            <p className="text-sm text-foreground/50">{c.label}</p>
            <p className="mt-1 text-xl font-extrabold text-brand">{c.value}</p>
          </div>
        ))}
      </div>

      <h2 className="mt-8 mb-3 font-bold">درآمد روزانه</h2>
      {report.revenueByDay.length === 0 ? (
        <p className="text-sm text-foreground/50">در این بازه سفارشی ثبت نشده است.</p>
      ) : (
        <div className="flex h-40 items-end gap-1 overflow-x-auto rounded-lg border border-border-color p-3">
          {report.revenueByDay.map((d) => (
            <div key={d.date} className="group relative flex h-full flex-1 min-w-[6px] flex-col justify-end">
              <div
                className="w-full rounded-t bg-brand transition-opacity group-hover:opacity-80"
                style={{ height: `${(d.total / maxDayRevenue) * 100}%` }}
                title={`${d.date}: ${toman(d.total)}`}
              />
            </div>
          ))}
        </div>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-3 font-bold">پرفروش‌ترین محصولات (بر اساس درآمد)</h2>
          {report.topProducts.length === 0 ? (
            <p className="text-sm text-foreground/50">داده‌ای وجود ندارد.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-color text-right text-xs text-foreground/50">
                  <th className="p-2">محصول</th>
                  <th className="p-2">تعداد</th>
                  <th className="p-2">درآمد</th>
                </tr>
              </thead>
              <tbody>
                {report.topProducts.map((p) => (
                  <tr key={p.productId} className="border-b border-border-color">
                    <td className="p-2">{p.name}</td>
                    <td className="p-2">{p.quantitySold.toLocaleString("fa-IR")}</td>
                    <td className="p-2 font-bold text-brand">{toman(p.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div>
          <h2 className="mb-3 font-bold">درآمد به تفکیک دسته‌بندی</h2>
          {report.revenueByCategory.length === 0 ? (
            <p className="text-sm text-foreground/50">داده‌ای وجود ندارد.</p>
          ) : (
            <div className="space-y-2">
              {report.revenueByCategory.map((c) => (
                <div key={c.categoryName} className="text-sm">
                  <div className="mb-1 flex justify-between">
                    <span>{c.categoryName}</span>
                    <span className="font-bold">{toman(c.revenue)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full rounded-full bg-brand" style={{ width: `${(c.revenue / maxCategoryRevenue) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-3 font-bold">مشتریان خرده‌فروش و عمده‌فروش</h2>
          <div className="space-y-1">
            {report.customerSegments.length === 0 ? (
              <p className="text-sm text-foreground/50">داده‌ای وجود ندارد.</p>
            ) : (
              report.customerSegments.map((s) => (
                <div key={s.customerType} className="flex items-center justify-between rounded-lg border border-border-color p-2 text-sm">
                  <span>{SEGMENT_LABEL[s.customerType] ?? s.customerType}</span>
                  <span className="text-foreground/60">{s.orders.toLocaleString("fa-IR")} سفارش</span>
                  <span className="font-bold text-brand">{toman(s.revenue)}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div>
          <h2 className="mb-3 font-bold">وضعیت سفارش‌ها در این بازه</h2>
          <div className="space-y-1">
            {report.ordersByStatus.map((s) => (
              <div key={s.status} className="flex justify-between rounded-lg border border-border-color p-2 text-sm">
                <span>{STATUS_LABEL[s.status] ?? s.status}</span>
                <span className="font-bold">{s.count.toLocaleString("fa-IR")}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
