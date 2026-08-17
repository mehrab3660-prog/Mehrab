"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { WholesaleLead } from "@/lib/types";

const STATUS_LABEL: Record<WholesaleLead["status"], string> = {
  NEW: "جدید",
  CONTACTED: "تماس گرفته شد",
  CONVERTED: "تبدیل به مشتری شد",
  CLOSED: "بسته شد",
};

const STATUSES: WholesaleLead["status"][] = ["NEW", "CONTACTED", "CONVERTED", "CLOSED"];

export default function AdminWholesaleLeadsPage() {
  const { accessToken } = useAuth();
  const { toast } = useToast();
  const [leads, setLeads] = useState<WholesaleLead[] | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  function load() {
    if (!accessToken) return;
    api.get<{ items: WholesaleLead[] }>("/wholesale-leads?take=100", accessToken).then((res) => setLeads(res.items));
  }

  useEffect(load, [accessToken]);

  async function handleStatus(id: string, status: WholesaleLead["status"]) {
    try {
      await api.patch(`/wholesale-leads/${id}/status`, { status, adminNote: notes[id] || undefined }, accessToken);
      toast("وضعیت درخواست به‌روزرسانی شد.", "success");
      load();
    } catch {
      toast("به‌روزرسانی با خطا مواجه شد.", "error");
    }
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">درخواست‌های همکاری عمده‌فروشی</h1>

      {leads === null ? (
        <p className="text-sm text-foreground/50">در حال بارگذاری...</p>
      ) : leads.length === 0 ? (
        <p className="text-sm text-foreground/50">درخواستی ثبت نشده است.</p>
      ) : (
        <div className="space-y-3">
          {leads.map((lead) => (
            <div key={lead.id} className="rounded-lg border border-border-color p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold">{lead.companyName}</span>
                <span className="text-brand">{STATUS_LABEL[lead.status]}</span>
              </div>
              <p className="mt-1 text-xs text-foreground/40">
                {lead.contactName} — {lead.phone}
                {lead.email ? ` — ${lead.email}` : ""}
              </p>
              <p className="mt-2 whitespace-pre-wrap text-foreground/80">{lead.message}</p>
              <p className="mt-2 text-xs text-foreground/40">{new Date(lead.createdAt).toLocaleDateString("fa-IR")}</p>
              {lead.adminNote && <p className="mt-1 text-xs text-foreground/50">یادداشت: {lead.adminNote}</p>}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input
                  placeholder="یادداشت (اختیاری)"
                  value={notes[lead.id] ?? ""}
                  onChange={(e) => setNotes({ ...notes, [lead.id]: e.target.value })}
                  className="flex-1 rounded-lg border border-border-color bg-background px-2 py-1 text-xs"
                />
                <select
                  value={lead.status}
                  onChange={(e) => handleStatus(lead.id, e.target.value as WholesaleLead["status"])}
                  className="rounded-lg border border-border-color bg-background px-2 py-1 text-xs"
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
