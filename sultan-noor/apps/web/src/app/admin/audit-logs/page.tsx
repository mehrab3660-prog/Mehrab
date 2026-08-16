"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { AuditLogEntry } from "@/lib/types";

export default function AdminAuditLogsPage() {
  const { accessToken, user } = useAuth();
  const [logs, setLogs] = useState<AuditLogEntry[] | null>(null);
  const [entityType, setEntityType] = useState("");

  function load() {
    if (!accessToken) return;
    const qs = entityType ? `?entityType=${encodeURIComponent(entityType)}` : "";
    api.get<AuditLogEntry[]>(`/audit-logs${qs}`, accessToken).then(setLogs);
  }

  useEffect(load, [accessToken, entityType]);

  if (user && user.role !== "SUPER_ADMIN" && user.role !== "ADMIN") {
    return <p className="text-sm text-foreground/60">این بخش فقط برای مدیران در دسترس است.</p>;
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">لاگ فعالیت و حسابرسی</h1>
      <div className="mb-4">
        <input
          placeholder="فیلتر نوع موجودیت (مثلاً Stock، User، Order)"
          value={entityType}
          onChange={(e) => setEntityType(e.target.value)}
          className="rounded-lg border border-border-color bg-background px-2 py-1 text-sm"
        />
      </div>

      {logs === null ? (
        <p className="text-sm text-foreground/50">در حال بارگذاری...</p>
      ) : logs.length === 0 ? (
        <p className="text-sm text-foreground/50">رویدادی یافت نشد.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-color text-right">
              <th className="p-2">زمان</th>
              <th className="p-2">کاربر</th>
              <th className="p-2">عملیات</th>
              <th className="p-2">موجودیت</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id} className="border-b border-border-color align-top">
                <td className="p-2 whitespace-nowrap text-foreground/60">{new Date(log.createdAt).toLocaleString("fa-IR")}</td>
                <td className="p-2">{log.user?.fullName ?? log.user?.phone ?? "—"}</td>
                <td className="p-2 font-mono">{log.action}</td>
                <td className="p-2 text-foreground/60">
                  {log.entityType} <span className="font-mono text-xs">#{log.entityId.slice(0, 8)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
