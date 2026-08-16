"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { PendingReview } from "@/lib/types";

export default function AdminReviewsPage() {
  const { accessToken } = useAuth();
  const { toast } = useToast();
  const [reviews, setReviews] = useState<PendingReview[] | null>(null);

  function load() {
    if (!accessToken) return;
    api.get<PendingReview[]>("/reviews/pending", accessToken).then(setReviews);
  }

  useEffect(load, [accessToken]);

  async function handleApprove(id: string) {
    try {
      await api.patch(`/reviews/${id}/approve`, undefined, accessToken);
      toast("نظر تایید شد.", "success");
      load();
    } catch {
      toast("تایید نظر با خطا مواجه شد.", "error");
    }
  }

  async function handleRemove(id: string) {
    try {
      await api.delete(`/reviews/${id}`, accessToken);
      toast("نظر حذف شد.", "success");
      load();
    } catch {
      toast("حذف نظر با خطا مواجه شد.", "error");
    }
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">نظرات در انتظار تایید</h1>

      {reviews === null ? (
        <p className="text-sm text-foreground/50">در حال بارگذاری...</p>
      ) : reviews.length === 0 ? (
        <p className="text-sm text-foreground/50">نظر جدیدی برای بررسی وجود ندارد.</p>
      ) : (
        <div className="space-y-3">
          {reviews.map((r) => (
            <div key={r.id} className="rounded-lg border border-border-color p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-bold">{r.product.name}</span>
                <span className="text-brand">{"⭐".repeat(r.rating)}</span>
              </div>
              {r.title && <p className="mt-1 font-medium">{r.title}</p>}
              {r.body && <p className="mt-1 text-foreground/70">{r.body}</p>}
              <p className="mt-1 text-xs text-foreground/40">
                {r.user.fullName ?? "کاربر"} — {r.user.phone}
              </p>
              <div className="mt-2 flex gap-3">
                <button onClick={() => handleApprove(r.id)} className="rounded-lg bg-brand px-3 py-1 text-xs text-[#0b0e14]">
                  تایید
                </button>
                <button onClick={() => handleRemove(r.id)} className="text-xs text-red-500">
                  حذف
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
