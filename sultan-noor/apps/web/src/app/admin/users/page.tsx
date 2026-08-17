"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { AdminUser } from "@/lib/types";
import AdminHelp from "@/components/admin/AdminHelp";

const ROLES = ["CUSTOMER", "B2B_CUSTOMER", "WAREHOUSE_MANAGER", "STAFF", "ADMIN", "SUPER_ADMIN"] as const;

const ROLE_LABELS: Record<string, string> = {
  CUSTOMER: "مشتری عادی",
  B2B_CUSTOMER: "مشتری عمده",
  WAREHOUSE_MANAGER: "مدیر انبار",
  STAFF: "کارمند",
  ADMIN: "مدیر",
  SUPER_ADMIN: "مدیر ارشد",
};

export default function AdminUsersPage() {
  const { accessToken, user: me } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState<AdminUser[]>([]);

  function load() {
    if (!accessToken) return;
    api.get<{ items: AdminUser[] }>("/users?take=100", accessToken).then((res) => setUsers(res.items));
  }

  useEffect(load, [accessToken]);

  async function handleRoleChange(id: string, role: string) {
    try {
      await api.patch(`/users/${id}/role`, { role }, accessToken);
      toast("نقش کاربر به‌روزرسانی شد.", "success");
      load();
    } catch {
      toast("فقط مدیر ارشد می‌تواند نقش‌های مدیریتی را تغییر دهد.", "error");
      load();
    }
  }

  const isSuperAdmin = me?.role === "SUPER_ADMIN";

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">کاربران و نقش‌ها</h1>
      <AdminHelp storageKey="users">
        <p>این لیست همه‌ی کسانی است که در سایت ثبت‌نام کرده‌اند. با تغییر «نقش» یک کاربر، سطح دسترسی او را تعیین می‌کنید.</p>
        <p>«مشتری عادی» و «مشتری عمده» دسترسی به پنل مدیریت ندارند. «مدیر انبار» فقط به بخش انبارها دسترسی دارد. «کارمند» و «مدیر» به بخش‌های مختلف پنل مدیریت دسترسی دارند. «مدیر ارشد» بالاترین دسترسی را دارد و تنها کسی است که می‌تواند نقش مدیر یا مدیر ارشد بدهد.</p>
        <p>در تغییر نقش افراد دقت کنید؛ به کسی که نمی‌شناسید نقش «مدیر» یا «مدیر ارشد» ندهید.</p>
      </AdminHelp>
      {!isSuperAdmin && (
        <p className="mb-4 rounded-lg border border-border-color p-3 text-sm text-foreground/60">
          فقط مدیر ارشد می‌تواند نقش‌های مدیریتی (مدیر / مدیر ارشد) را تغییر دهد.
        </p>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border-color text-right">
            <th className="p-2">شماره موبایل</th>
            <th className="p-2">نام</th>
            <th className="p-2">نوع مشتری</th>
            <th className="p-2">نقش</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-b border-border-color">
              <td className="p-2 font-mono">{u.phone}</td>
              <td className="p-2">{u.fullName ?? "—"}</td>
              <td className="p-2">{u.customerType === "WHOLESALE" ? "عمده" : "خرده"}</td>
              <td className="p-2">
                <select
                  value={u.role}
                  onChange={(e) => handleRoleChange(u.id, e.target.value)}
                  className="rounded-lg border border-border-color bg-background px-2 py-1"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {users.length === 0 && <p className="mt-2 text-sm text-foreground/50">کاربری یافت نشد.</p>}
    </div>
  );
}
