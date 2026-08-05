"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Order } from "@/lib/types";

interface OrderDetail extends Order {
  invoice?: { pdfUrl: string } | null;
}

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { accessToken } = useAuth();
  const [order, setOrder] = useState<OrderDetail | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    api.get<OrderDetail>(`/orders/${id}`, accessToken).then(setOrder);
  }, [accessToken, id]);

  if (!order) return <div className="mx-auto max-w-3xl px-4 py-16 text-center">در حال بارگذاری...</div>;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-2 text-2xl font-bold">سفارش {order.orderNumber}</h1>
      <p className="mb-6 text-sm text-foreground/50">وضعیت: {order.status}</p>

      <div className="space-y-2">
        {order.items.map((item) => (
          <div key={item.id} className="flex justify-between rounded-lg border border-border-color p-3 text-sm">
            <span>
              {item.nameSnapshot} × {item.quantity}
            </span>
            <span className="font-bold">{Number(item.lineTotal).toLocaleString("fa-IR")} تومان</span>
          </div>
        ))}
      </div>

      <div className="mt-6 space-y-1 rounded-lg bg-surface p-4 text-sm">
        <div className="flex justify-between">
          <span>جمع جزء</span>
          <span>{Number(order.subtotal).toLocaleString("fa-IR")} تومان</span>
        </div>
        <div className="flex justify-between">
          <span>تخفیف</span>
          <span>{Number(order.discountTotal).toLocaleString("fa-IR")} تومان</span>
        </div>
        <div className="flex justify-between">
          <span>هزینه ارسال</span>
          <span>{Number(order.shippingTotal).toLocaleString("fa-IR")} تومان</span>
        </div>
        <div className="flex justify-between text-base font-bold text-brand">
          <span>مبلغ نهایی</span>
          <span>{Number(order.grandTotal).toLocaleString("fa-IR")} تومان</span>
        </div>
      </div>

      {order.invoice?.pdfUrl && (
        <a href={order.invoice.pdfUrl} target="_blank" className="mt-4 inline-block text-sm text-brand">
          دانلود فاکتور PDF
        </a>
      )}
    </div>
  );
}
