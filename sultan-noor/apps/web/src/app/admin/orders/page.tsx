"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Order } from "@/lib/types";

const STATUSES = ["PENDING_PAYMENT", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED", "REFUNDED"];

const DELIVERY_SLOT_LABEL: Record<string, string> = {
  MORNING: "۹ تا ۱۲",
  AFTERNOON: "۱۲ تا ۱۶",
  EVENING: "۱۶ تا ۲۰",
};

export default function AdminOrdersPage() {
  const { accessToken } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);

  function load() {
    if (!accessToken) return;
    api.get<{ items: Order[] }>("/orders?take=100", accessToken).then((res) => setOrders(res.items));
  }

  useEffect(load, [accessToken]);

  async function updateStatus(id: string, status: string) {
    await api.patch(`/orders/${id}/status`, { status }, accessToken);
    load();
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">مدیریت سفارش‌ها</h1>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border-color text-right">
            <th className="p-2">شماره سفارش</th>
            <th className="p-2">مبلغ نهایی</th>
            <th className="p-2">زمان تحویل</th>
            <th className="p-2">وضعیت</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id} className="border-b border-border-color">
              <td className="p-2">{o.orderNumber}</td>
              <td className="p-2">{Number(o.grandTotal).toLocaleString("fa-IR")} تومان</td>
              <td className="p-2 text-xs text-foreground/60">
                {o.deliveryDate && o.deliverySlot
                  ? `${new Date(o.deliveryDate).toLocaleDateString("fa-IR")} — ${DELIVERY_SLOT_LABEL[o.deliverySlot]}`
                  : "—"}
              </td>
              <td className="p-2">
                <select
                  value={o.status}
                  onChange={(e) => updateStatus(o.id, e.target.value)}
                  className="rounded-lg border border-border-color bg-background px-2 py-1"
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
