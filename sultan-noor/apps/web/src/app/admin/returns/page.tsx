"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { ReturnRequest } from "@/lib/types";
import AdminHelp from "@/components/admin/AdminHelp";

const STATUS_LABEL: Record<ReturnRequest["status"], string> = {
  PENDING: "در انتظار بررسی",
  APPROVED: "تایید شده",
  REJECTED: "رد شده",
  REFUNDED: "بازگشت وجه انجام شد",
};

export default function AdminReturnsPage() {
  const { accessToken } = useAuth();
  const { toast } = useToast();
  const [requests, setRequests] = useState<ReturnRequest[] | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  function load() {
    if (!accessToken) return;
    api.get<ReturnRequest[]>("/returns", accessToken).then(setRequests);
  }

  useEffect(load, [accessToken]);

  async function handleStatus(id: string, status: "APPROVED" | "REJECTED" | "REFUNDED") {
    try {
      await api.patch(`/returns/${id}/status`, { status, adminNote: notes[id] || undefined }, accessToken);
      toast("وضعیت درخواست به‌روزرسانی شد.", "success");
      load();
    } catch {
      toast("به‌روزرسانی با خطا مواجه شد.", "error");
    }
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">درخواست‌های مرجوعی</h1>

      <AdminHelp storageKey="returns">
        <p>وقتی مشتری درخواست مرجوعی کالا می‌دهد، این درخواست اینجا با وضعیت «در انتظار بررسی» نمایش داده می‌شود.</p>
        <p>بعد از بررسی کالا، اگر مرجوعی قابل قبول است روی «تایید» بزنید، در غیر این صورت روی «رد» بزنید. می‌توانید قبل از تصمیم‌گیری یک یادداشت هم بنویسید.</p>
        <p>بعد از تایید و دریافت فیزیکی کالا، دکمه‌ی «ثبت بازگشت وجه» را بزنید تا مرحله نهایی (برگرداندن پول به مشتری) ثبت شود.</p>
      </AdminHelp>

      {requests === null ? (
        <p className="text-sm text-foreground/50">در حال بارگذاری...</p>
      ) : requests.length === 0 ? (
        <p className="text-sm text-foreground/50">درخواست مرجوعی‌ای وجود ندارد.</p>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <div key={r.id} className="rounded-lg border border-border-color p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-bold">سفارش {r.order.orderNumber}</span>
                <span className="text-brand">{STATUS_LABEL[r.status]}</span>
              </div>
              <p className="mt-1 text-xs text-foreground/40">
                {r.user.fullName ?? "کاربر"} — {r.user.phone}
              </p>
              <p className="mt-2">دلیل: {r.reason}</p>
              <ul className="mt-1 text-xs text-foreground/60">
                {r.items.map((it) => (
                  <li key={it.id}>
                    {it.orderItem.nameSnapshot} × {it.quantity}
                  </li>
                ))}
              </ul>

              {r.status === "PENDING" && (
                <div className="mt-3 space-y-2">
                  <input
                    placeholder="یادداشت (اختیاری)"
                    value={notes[r.id] ?? ""}
                    onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })}
                    className="w-full rounded-lg border border-border-color bg-background px-2 py-1 text-xs"
                  />
                  <div className="flex gap-2">
                    <button onClick={() => handleStatus(r.id, "APPROVED")} className="rounded-lg bg-brand px-3 py-1 text-xs text-[#0b0e14]">
                      تایید
                    </button>
                    <button onClick={() => handleStatus(r.id, "REJECTED")} className="text-xs text-red-500">
                      رد
                    </button>
                  </div>
                </div>
              )}

              {r.status === "APPROVED" && (
                <button
                  onClick={() => handleStatus(r.id, "REFUNDED")}
                  className="mt-3 rounded-lg bg-brand px-3 py-1 text-xs text-[#0b0e14]"
                >
                  ثبت بازگشت وجه
                </button>
              )}

              {r.adminNote && <p className="mt-2 text-xs text-foreground/50">یادداشت: {r.adminNote}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
