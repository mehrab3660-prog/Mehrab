"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Order } from "@/lib/types";

const STATUS_LABELS: Record<string, string> = {
  PENDING_PAYMENT: "در انتظار پرداخت",
  PROCESSING: "در حال پردازش",
  SHIPPED: "ارسال شده",
  DELIVERED: "تحویل داده شده",
  CANCELLED: "لغو شده",
  REFUNDED: "بازگشت وجه",
};

export default function OrdersPage() {
  const { user, accessToken, logout } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);

  useEffect(() => {
    if (!accessToken) return;
    api.get<Order[]>("/orders/mine", accessToken).then(setOrders);
  }, [accessToken]);

  if (!user) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p>برای مشاهده سفارش‌ها ابتدا وارد شوید.</p>
        <Link href="/login" className="mt-4 inline-block rounded-lg bg-brand px-5 py-2 text-[#0b0e14]">
          ورود / ثبت‌نام
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">سفارش‌های من</h1>
        <button
          onClick={logout}
          className="rounded-lg border border-border-color px-3 py-1.5 text-sm font-medium text-foreground/70 transition-colors hover:border-red-400/40 hover:text-red-400"
        >
          خروج از حساب
        </button>
      </div>
      {orders.length === 0 ? (
        <p className="text-foreground/60">هنوز سفارشی ثبت نکرده‌اید.</p>
      ) : (
        <div className="space-y-3">
          {orders.map((o) => (
            <Link
              key={o.id}
              href={`/orders/${o.id}`}
              className="flex items-center justify-between rounded-lg border border-border-color p-4 hover:bg-surface"
            >
              <div>
                <p className="font-bold">{o.orderNumber}</p>
                <p className="text-sm text-foreground/50">{STATUS_LABELS[o.status] ?? o.status}</p>
              </div>
              <p className="font-bold text-brand">{Number(o.grandTotal).toLocaleString("fa-IR")} تومان</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
