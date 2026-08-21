"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { AiActivityEntry, ApprovalCenterList, ApprovalItemType } from "@/lib/types";
import AdminHelp from "@/components/admin/AdminHelp";

const TYPE_LABEL: Record<ApprovalItemType, string> = {
  PRODUCT_DRAFT: "محصول AI",
  SEO_SUGGESTION: "پیشنهاد سئو",
  CONTENT_DRAFT: "محتوای تولیدشده",
  SALES_RECOMMENDATION: "پیشنهاد فروش",
  NEWS_ITEM: "خبر",
  REORDER_RECOMMENDATION: "تجدید موجودی",
};

export default function ApprovalCenterPage() {
  const { accessToken } = useAuth();
  const { toast } = useToast();
  const [data, setData] = useState<ApprovalCenterList | null>(null);
  const [activity, setActivity] = useState<AiActivityEntry[] | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<ApprovalItemType | "">("");

  function load() {
    if (!accessToken) return;
    api.get<ApprovalCenterList>("/approval-center", accessToken).then(setData);
    api.get<AiActivityEntry[]>("/approval-center/activity-log?limit=20", accessToken).then(setActivity);
  }

  useEffect(load, [accessToken]);

  async function handleApprove(type: ApprovalItemType, id: string) {
    setBusyKey(`${type}:${id}`);
    try {
      await api.post(`/approval-center/${type}/${id}/approve`, undefined, accessToken);
      toast("تأیید شد.", "success");
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "تأیید ناموفق بود — برای این نوع مورد ممکن است نیاز به بررسی کامل در صفحه اختصاصی آن باشد.", "error");
    } finally {
      setBusyKey(null);
    }
  }

  async function handleReject(type: ApprovalItemType, id: string) {
    setBusyKey(`${type}:${id}`);
    try {
      await api.post(`/approval-center/${type}/${id}/reject`, undefined, accessToken);
      toast("رد شد.", "success");
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "رد ناموفق بود.", "error");
    } finally {
      setBusyKey(null);
    }
  }

  const items = data?.items.filter((i) => !typeFilter || i.type === typeFilter) ?? [];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">کارهای آماده تأیید</h1>

      <AdminHelp storageKey="approval-center">
        <p>همه پیشنهادها و پیش‌نویس‌های ساخته‌شده توسط هوش مصنوعی در سراسر فروشگاه اینجا جمع‌آوری می‌شوند. تأیید یا رد از همین جا مستقیماً همان عملیات بخش اصلی آن مورد را انجام می‌دهد — چیز جدیدی ساخته یا اجرا نمی‌شود.</p>
        <p>تأیید یک محصول یا محتوای AI از این صفحه همیشه به‌صورت پیش‌نویس (بدون انتشار) ذخیره می‌شود؛ برای انتشار باید از صفحه اختصاصی همان بخش اقدام کنید.</p>
      </AdminHelp>

      {data && (
        <div className="mb-4 flex flex-wrap gap-2">
          <button onClick={() => setTypeFilter("")} className={`rounded-lg border px-3 py-1.5 text-xs ${!typeFilter ? "border-brand text-brand" : "border-border-color"}`}>
            همه ({data.total})
          </button>
          {(Object.keys(TYPE_LABEL) as ApprovalItemType[]).map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`rounded-lg border px-3 py-1.5 text-xs ${typeFilter === t ? "border-brand text-brand" : "border-border-color"}`}
            >
              {TYPE_LABEL[t]} ({data.counts[t] ?? 0})
            </button>
          ))}
        </div>
      )}

      {data === null ? (
        <p className="text-sm text-foreground/50">در حال بارگذاری...</p>
      ) : items.length === 0 ? (
        <p className="mb-8 text-sm text-foreground/50">موردی در انتظار تأیید نیست.</p>
      ) : (
        <div className="mb-8 space-y-2">
          {items.map((item) => {
            const key = `${item.type}:${item.id}`;
            return (
              <div key={key} className="flex items-center justify-between rounded-lg border border-border-color p-3 text-sm">
                <div>
                  <p className="font-bold">{item.title}</p>
                  <p className="text-xs text-foreground/50">{TYPE_LABEL[item.type]}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleApprove(item.type, item.id)}
                    disabled={busyKey === key}
                    className="rounded bg-green-500/10 px-3 py-1 text-xs font-bold text-green-500 disabled:opacity-50"
                  >
                    تأیید
                  </button>
                  <button
                    onClick={() => handleReject(item.type, item.id)}
                    disabled={busyKey === key}
                    className="rounded bg-red-500/10 px-3 py-1 text-xs font-bold text-red-500 disabled:opacity-50"
                  >
                    رد
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <section>
        <h2 className="mb-3 font-bold">لاگ فعالیت هوش مصنوعی</h2>
        {activity === null ? (
          <p className="text-sm text-foreground/50">در حال بارگذاری...</p>
        ) : (
          <div className="space-y-1">
            {activity.map((a, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg border border-border-color p-2 text-xs">
                <span>{a.label}</span>
                <span className="text-foreground/50">
                  {a.userName ?? "سیستم"} — {new Date(a.createdAt).toLocaleString("fa-IR")}
                  {a.costToman !== null && ` — ${a.costToman.toLocaleString("fa-IR")} تومان`}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
