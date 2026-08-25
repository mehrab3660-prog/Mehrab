"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { Warehouse, StockLevel } from "@/lib/types";
import AdminHelp from "@/components/admin/AdminHelp";

export default function AdminWarehousesPage() {
  const { accessToken } = useAuth();
  const { toast } = useToast();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [form, setForm] = useState({ name: "", address: "" });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [stock, setStock] = useState<StockLevel[] | null>(null);
  const [adjustForm, setAdjustForm] = useState({ productVariantId: "", quantityDelta: "" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: "", address: "" });

  function load() {
    if (!accessToken) return;
    api.get<Warehouse[]>("/warehouses", accessToken).then(setWarehouses);
  }

  useEffect(load, [accessToken]);

  function loadStock(id: string) {
    setSelectedId(id);
    setStock(null);
    api.get<StockLevel[]>(`/warehouses/${id}/stock`, accessToken).then(setStock);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.post("/warehouses", form, accessToken);
      setForm({ name: "", address: "" });
      toast("انبار ایجاد شد.", "success");
      load();
    } catch {
      toast("ایجاد انبار با خطا مواجه شد.", "error");
    }
  }

  async function toggleActive(w: Warehouse) {
    await api.patch(`/warehouses/${w.id}`, { isActive: !w.isActive }, accessToken);
    load();
  }

  function startEdit(w: Warehouse) {
    setEditingId(w.id);
    setEditForm({ name: w.name, address: w.address ?? "" });
  }

  async function handleEditSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    await api.patch(`/warehouses/${editingId}`, { name: editForm.name, address: editForm.address || undefined }, accessToken);
    setEditingId(null);
    load();
  }

  async function handleDelete(id: string) {
    try {
      await api.delete(`/warehouses/${id}`, accessToken);
      if (selectedId === id) {
        setSelectedId(null);
        setStock(null);
      }
      load();
    } catch {
      toast("حذف انبار با خطا مواجه شد.", "error");
    }
  }

  async function handleAdjust(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId) return;
    try {
      await api.post(
        `/warehouses/${selectedId}/stock/adjust`,
        { productVariantId: adjustForm.productVariantId, quantityDelta: Number(adjustForm.quantityDelta) },
        accessToken,
      );
      setAdjustForm({ productVariantId: "", quantityDelta: "" });
      toast("موجودی به‌روزرسانی شد.", "success");
      loadStock(selectedId);
    } catch {
      toast("به‌روزرسانی موجودی با خطا مواجه شد.", "error");
    }
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">انبارها و موجودی</h1>

      <AdminHelp storageKey="warehouses">
        <p>هر انبار یک مکان فیزیکی نگهداری کالاست. با فرم بالا انبار جدید بسازید و با «فعال کردن / غیرفعال کردن» تعیین کنید که سفارش‌ها به آن انبار هدایت شوند یا نه.</p>
        <p>با کلیک روی نام یک انبار، موجودی همان انبار پایین صفحه نمایش داده می‌شود.</p>
        <p>برای تغییر موجودی، ستون SKU جدول را برای پیدا کردن محصول موردنظر ببینید و «شناسه تنوع محصول» (Variant ID) آن را در فرم «ثبت تغییر موجودی» وارد کنید. برای افزایش موجودی عدد مثبت و برای کم کردن عدد منفی بنویسید. اگر شناسه‌ی تنوع محصول را نمی‌دانید، از توسعه‌دهنده‌ی سایت بپرسید.</p>
      </AdminHelp>

      <form onSubmit={handleCreate} className="mb-6 flex flex-wrap gap-2">
        <input
          required
          placeholder="نام انبار"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="rounded-lg border border-border-color bg-background px-2 py-1 text-sm"
        />
        <input
          placeholder="آدرس (اختیاری)"
          value={form.address}
          onChange={(e) => setForm({ ...form, address: e.target.value })}
          className="rounded-lg border border-border-color bg-background px-2 py-1 text-sm"
        />
        <button className="rounded-lg bg-brand px-3 py-1 text-sm text-[#0b0e14]">افزودن</button>
      </form>

      <ul className="mb-8 space-y-1">
        {warehouses.map((w) =>
          editingId === w.id ? (
            <li key={w.id} className="rounded-lg border border-border-color bg-surface p-2 text-sm">
              <form onSubmit={handleEditSave} className="flex flex-wrap items-center gap-2">
                <input
                  required
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="rounded-lg border border-border-color bg-background px-2 py-1 text-sm"
                />
                <input
                  placeholder="آدرس (اختیاری)"
                  value={editForm.address}
                  onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                  className="rounded-lg border border-border-color bg-background px-2 py-1 text-sm"
                />
                <button className="rounded-lg bg-brand px-3 py-1 text-xs font-bold text-[#0b0e14]">ذخیره</button>
                <button type="button" onClick={() => setEditingId(null)} className="text-xs text-foreground/60">
                  انصراف
                </button>
              </form>
            </li>
          ) : (
            <li key={w.id} className="flex items-center justify-between rounded-lg border border-border-color p-2 text-sm">
              <button onClick={() => loadStock(w.id)} className={`text-right ${selectedId === w.id ? "font-bold text-brand" : ""}`}>
                {w.name}
                {w.address && <span className="text-foreground/50"> — {w.address}</span>}
                {!w.isActive && <span className="mr-2 text-xs text-red-400">(غیرفعال)</span>}
              </button>
              <span className="flex gap-3">
                <button onClick={() => startEdit(w)} className="text-brand">
                  ویرایش
                </button>
                <button onClick={() => toggleActive(w)} className="text-foreground/60 hover:text-brand">
                  {w.isActive ? "غیرفعال کردن" : "فعال کردن"}
                </button>
                <button onClick={() => handleDelete(w.id)} className="text-red-500">
                  حذف
                </button>
              </span>
            </li>
          ),
        )}
        {warehouses.length === 0 && <p className="text-sm text-foreground/50">هنوز انباری ثبت نشده است.</p>}
      </ul>

      {selectedId && (
        <div>
          <h2 className="mb-3 text-lg font-bold">موجودی انبار انتخاب‌شده</h2>
          <form onSubmit={handleAdjust} className="mb-4 flex flex-wrap items-end gap-2">
            <div>
              <label className="mb-1 block text-xs text-foreground/50">شناسه تنوع محصول (Variant ID)</label>
              <input
                required
                value={adjustForm.productVariantId}
                onChange={(e) => setAdjustForm({ ...adjustForm, productVariantId: e.target.value })}
                className="rounded-lg border border-border-color bg-background px-2 py-1 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-foreground/50">تغییر تعداد (+/-)</label>
              <input
                required
                type="number"
                value={adjustForm.quantityDelta}
                onChange={(e) => setAdjustForm({ ...adjustForm, quantityDelta: e.target.value })}
                className="w-28 rounded-lg border border-border-color bg-background px-2 py-1 text-sm"
              />
            </div>
            <button className="rounded-lg bg-brand px-3 py-1.5 text-sm text-[#0b0e14]">ثبت تغییر موجودی</button>
          </form>

          {stock === null ? (
            <p className="text-sm text-foreground/50">در حال بارگذاری...</p>
          ) : stock.length === 0 ? (
            <p className="text-sm text-foreground/50">هنوز موجودی برای این انبار ثبت نشده است.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-color text-right">
                  <th className="p-2">محصول</th>
                  <th className="p-2">SKU</th>
                  <th className="p-2">موجودی</th>
                  <th className="p-2">رزرو‌شده</th>
                </tr>
              </thead>
              <tbody>
                {stock.map((s) => (
                  <tr key={s.id} className="border-b border-border-color">
                    <td className="p-2">{s.productVariant.product.name}</td>
                    <td className="p-2 text-foreground/60">{s.productVariant.sku}</td>
                    <td className="p-2">{s.quantity.toLocaleString("fa-IR")}</td>
                    <td className="p-2">{s.reservedQuantity.toLocaleString("fa-IR")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
