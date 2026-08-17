"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { Supplier } from "@/lib/types";
import AdminHelp from "@/components/admin/AdminHelp";

export default function AdminSuppliersPage() {
  const { accessToken } = useAuth();
  const { toast } = useToast();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [form, setForm] = useState({ name: "", contactName: "", phone: "", email: "", address: "" });

  function load() {
    if (!accessToken) return;
    api.get<Supplier[]>("/suppliers", accessToken).then(setSuppliers);
  }

  useEffect(load, [accessToken]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.post("/suppliers", form, accessToken);
      setForm({ name: "", contactName: "", phone: "", email: "", address: "" });
      toast("تامین‌کننده ایجاد شد.", "success");
      load();
    } catch {
      toast("ایجاد تامین‌کننده با خطا مواجه شد.", "error");
    }
  }

  async function toggleActive(s: Supplier) {
    await api.patch(`/suppliers/${s.id}`, { isActive: !s.isActive }, accessToken);
    load();
  }

  async function handleDelete(id: string) {
    try {
      await api.delete(`/suppliers/${id}`, accessToken);
      load();
    } catch {
      toast("حذف تامین‌کننده با خطا مواجه شد.", "error");
    }
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">تامین‌کنندگان</h1>

      <AdminHelp storageKey="suppliers">
        <p>این بخش فقط برای نگهداری اطلاعات تماس شرکت‌ها یا افرادی است که از آن‌ها کالا خرید می‌کنید (عمده‌فروشان و کارخانه‌ها). این لیست به مشتریان نمایش داده نمی‌شود.</p>
        <p>«نام تامین‌کننده» الزامی است؛ بقیه‌ی فیلدها (نام رابط، تلفن، ایمیل، آدرس) اختیاری هستند و فقط برای یادداشت شماست.</p>
        <p>اگر دیگر با یک تامین‌کننده همکاری ندارید، لازم نیست حذفش کنید؛ کافی است «غیرفعال کردن» را بزنید تا در لیست بماند ولی به‌عنوان همکار فعال حساب نشود.</p>
      </AdminHelp>

      <form onSubmit={handleCreate} className="mb-6 flex flex-wrap gap-2">
        <input
          required
          placeholder="نام تامین‌کننده"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="rounded-lg border border-border-color bg-background px-2 py-1 text-sm"
        />
        <input
          placeholder="نام رابط"
          value={form.contactName}
          onChange={(e) => setForm({ ...form, contactName: e.target.value })}
          className="rounded-lg border border-border-color bg-background px-2 py-1 text-sm"
        />
        <input
          placeholder="تلفن"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
          className="rounded-lg border border-border-color bg-background px-2 py-1 text-sm"
        />
        <input
          placeholder="ایمیل"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          className="rounded-lg border border-border-color bg-background px-2 py-1 text-sm"
        />
        <input
          placeholder="آدرس"
          value={form.address}
          onChange={(e) => setForm({ ...form, address: e.target.value })}
          className="rounded-lg border border-border-color bg-background px-2 py-1 text-sm"
        />
        <button className="rounded-lg bg-brand px-3 py-1 text-sm text-[#0b0e14]">افزودن</button>
      </form>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border-color text-right">
            <th className="p-2">نام</th>
            <th className="p-2">رابط</th>
            <th className="p-2">تماس</th>
            <th className="p-2">وضعیت</th>
            <th className="p-2"></th>
          </tr>
        </thead>
        <tbody>
          {suppliers.map((s) => (
            <tr key={s.id} className="border-b border-border-color">
              <td className="p-2">{s.name}</td>
              <td className="p-2 text-foreground/60">{s.contactName ?? "—"}</td>
              <td className="p-2 text-foreground/60">{s.phone ?? s.email ?? "—"}</td>
              <td className="p-2">{s.isActive ? "فعال" : "غیرفعال"}</td>
              <td className="flex gap-3 p-2">
                <button onClick={() => toggleActive(s)} className="text-foreground/60 hover:text-brand">
                  {s.isActive ? "غیرفعال کردن" : "فعال کردن"}
                </button>
                <button onClick={() => handleDelete(s.id)} className="text-red-500">
                  حذف
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {suppliers.length === 0 && <p className="mt-2 text-sm text-foreground/50">هنوز تامین‌کننده‌ای ثبت نشده است.</p>}
    </div>
  );
}
