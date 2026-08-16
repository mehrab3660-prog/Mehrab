"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { Order, ReturnRequest } from "@/lib/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

interface OrderDetail extends Order {
  invoice?: { invoiceNumber: string } | null;
}

const RETURN_STATUS_LABEL: Record<ReturnRequest["status"], string> = {
  PENDING: "در انتظار بررسی",
  APPROVED: "تایید شده — در انتظار بازگشت وجه",
  REJECTED: "رد شده",
  REFUNDED: "وجه بازگردانده شد",
};

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { accessToken } = useAuth();
  const { toast } = useToast();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [returnRequests, setReturnRequests] = useState<ReturnRequest[]>([]);
  const [showReturnForm, setShowReturnForm] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Record<string, number>>({});
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    api.get<OrderDetail>(`/orders/${id}`, accessToken).then(setOrder);
  }, [accessToken, id]);

  function loadReturnRequests(orderNumber: string) {
    if (!accessToken) return;
    api
      .get<ReturnRequest[]>("/returns/mine", accessToken)
      .then((all) => setReturnRequests(all.filter((r) => r.order.orderNumber === orderNumber)));
  }

  useEffect(() => {
    if (order) loadReturnRequests(order.orderNumber);
    // loadReturnRequests is defined inline above and intentionally excluded
    // from deps — it's stable per accessToken, which is already listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order, accessToken]);

  async function handleDownloadInvoice() {
    if (!accessToken) return;
    setDownloading(true);
    try {
      const res = await fetch(`${API_URL}/orders/${id}/invoice/download`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error("دانلود فاکتور ناموفق بود");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${order?.invoice?.invoiceNumber ?? "invoice"}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }

  function toggleItem(itemId: string, maxQuantity: number) {
    setSelectedItems((prev) => {
      const next = { ...prev };
      if (itemId in next) delete next[itemId];
      else next[itemId] = maxQuantity;
      return next;
    });
  }

  async function handleSubmitReturn(e: React.FormEvent) {
    e.preventDefault();
    if (!order || !accessToken) return;
    const items = Object.entries(selectedItems).map(([orderItemId, quantity]) => ({ orderItemId, quantity }));
    if (items.length === 0) {
      toast("حداقل یک کالا را برای مرجوعی انتخاب کنید.", "error");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/returns", { orderId: order.id, reason, items }, accessToken);
      toast("درخواست مرجوعی ثبت شد.", "success");
      setShowReturnForm(false);
      setSelectedItems({});
      setReason("");
      loadReturnRequests(order.orderNumber);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "ثبت درخواست با خطا مواجه شد.", "error");
    } finally {
      setSubmitting(false);
    }
  }

  if (!order) return <div className="mx-auto max-w-3xl px-4 py-16 text-center">در حال بارگذاری...</div>;

  const hasActiveReturn = returnRequests.some((r) => r.status === "PENDING" || r.status === "APPROVED" || r.status === "REFUNDED");
  const canRequestReturn = order.status === "DELIVERED" && !hasActiveReturn;

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

      {order.invoice && (
        <button
          onClick={handleDownloadInvoice}
          disabled={downloading}
          className="mt-4 inline-block text-sm text-brand disabled:opacity-50"
        >
          {downloading ? "در حال دانلود..." : "دانلود فاکتور PDF"}
        </button>
      )}

      {returnRequests.length > 0 && (
        <div className="mt-8 space-y-2">
          <h2 className="font-bold">درخواست‌های مرجوعی</h2>
          {returnRequests.map((r) => (
            <div key={r.id} className="rounded-lg border border-border-color p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium">{RETURN_STATUS_LABEL[r.status]}</span>
                <span className="text-xs text-foreground/40">{new Date(r.createdAt).toLocaleDateString("fa-IR")}</span>
              </div>
              <p className="mt-1 text-foreground/70">دلیل: {r.reason}</p>
              <ul className="mt-1 text-xs text-foreground/50">
                {r.items.map((it) => (
                  <li key={it.id}>
                    {it.orderItem.nameSnapshot} × {it.quantity}
                  </li>
                ))}
              </ul>
              {r.adminNote && <p className="mt-1 text-xs text-foreground/50">یادداشت پشتیبانی: {r.adminNote}</p>}
            </div>
          ))}
        </div>
      )}

      {canRequestReturn && !showReturnForm && (
        <button
          onClick={() => setShowReturnForm(true)}
          className="mt-6 rounded-lg border border-border-color px-4 py-2 text-sm font-bold text-foreground hover:border-brand hover:text-brand"
        >
          درخواست مرجوعی کالا
        </button>
      )}

      {canRequestReturn && showReturnForm && (
        <form onSubmit={handleSubmitReturn} className="mt-6 space-y-3 rounded-2xl surface-card p-4">
          <h2 className="font-bold">درخواست مرجوعی کالا</h2>
          <div className="space-y-2">
            {order.items.map((item) => (
              <label key={item.id} className="flex items-center gap-2 rounded-lg border border-border-color p-2 text-sm">
                <input type="checkbox" checked={item.id in selectedItems} onChange={() => toggleItem(item.id, item.quantity)} />
                {item.nameSnapshot} × {item.quantity}
              </label>
            ))}
          </div>
          <textarea
            required
            minLength={5}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="دلیل مرجوعی را بنویسید..."
            className="w-full rounded-lg border border-border-color bg-background px-3 py-2 text-sm"
            rows={3}
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-[#0b0e14] disabled:opacity-50"
            >
              {submitting ? "در حال ارسال..." : "ثبت درخواست"}
            </button>
            <button type="button" onClick={() => setShowReturnForm(false)} className="text-sm text-foreground/50">
              انصراف
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
