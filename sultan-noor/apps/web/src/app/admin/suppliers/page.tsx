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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: "", contactName: "", phone: "", email: "", address: "" });

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

  function startEdit(s: Supplier) {
    setEditingId(s.id);
    setEditForm({
      name: s.name,
      contactName: s.contactName ?? "",
      phone: s.phone ?? "",
      email: s.email ?? "",
      address: s.address ?? "",
    });
  }

  async function handleEditSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    await api.patch(
      `/suppliers/${editingId}`,
      {
        name: editForm.name,
        contactName: editForm.contactName || undefined,
        phone: editForm.phone || undefined,
        email: editForm.email || undefined,
        address: editForm.address || undefined,
      },
      accessToken,
    );
    setEditingId(null);
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
          {suppliers.map((s) =>
            editingId === s.id ? (
              <tr key={s.id} className="border-b border-border-color bg-surface">
                <td colSpan={5} className="p-3">
                  <form onSubmit={handleEditSave} className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                    <input
                      required
                      placeholder="نام تامین‌کننده"
                      value={editForm.name}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      className="rounded-lg border border-border-color bg-background px-2 py-1 text-sm"
                    />
                    <input
                      placeholder="نام رابط"
                      value={editForm.contactName}
                      onChange={(e) => setEditForm({ ...editForm, contactName: e.target.value })}
                      className="rounded-lg border border-border-color bg-background px-2 py-1 text-sm"
                    />
                    <input
                      placeholder="تلفن"
                      value={editForm.phone}
                      onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                      className="rounded-lg border border-border-color bg-background px-2 py-1 text-sm"
                    />
                    <input
                      placeholder="ایمیل"
                      value={editForm.email}
                      onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                      className="rounded-lg border border-border-color bg-background px-2 py-1 text-sm"
                    />
                    <input
                      placeholder="آدرس"
                      value={editForm.address}
                      onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                      className="rounded-lg border border-border-color bg-background px-2 py-1 text-sm"
                    />
                    <div className="col-span-2 flex gap-2 sm:col-span-5">
                      <button className="rounded-lg bg-brand px-3 py-1 text-xs font-bold text-[#0b0e14]">ذخیره</button>
                      <button type="button" onClick={() => setEditingId(null)} className="text-xs text-foreground/60">
                        انصراف
                      </button>
                    </div>
                  </form>
                </td>
              </tr>
            ) : (
              <tr key={s.id} className="border-b border-border-color">
                <td className="p-2">{s.name}</td>
                <td className="p-2 text-foreground/60">{s.contactName ?? "—"}</td>
                <td className="p-2 text-foreground/60">{s.phone ?? s.email ?? "—"}</td>
                <td className="p-2">{s.isActive ? "فعال" : "غیرفعال"}</td>
                <td className="flex gap-3 p-2">
                  <button onClick={() => startEdit(s)} className="text-brand">
                    ویرایش
                  </button>
                  <button onClick={() => toggleActive(s)} className="text-foreground/60 hover:text-brand">
                    {s.isActive ? "غیرفعال کردن" : "فعال کردن"}
                  </button>
                  <button onClick={() => handleDelete(s.id)} className="text-red-500">
                    حذف
                  </button>
                </td>
              </tr>
            ),
          )}
        </tbody>
      </table>
      {suppliers.length === 0 && <p className="mt-2 text-sm text-foreground/50">هنوز تامین‌کننده‌ای ثبت نشده است.</p>}
    </div>
  );
}
