"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Product } from "@/lib/types";
import AdminHelp from "@/components/admin/AdminHelp";

interface Hotspot {
  id: string;
  label: string;
  icon: string;
  positionX: number;
  positionY: number;
  positionZ: number;
  order: number;
  isActive: boolean;
  productId: string;
  product: { id: string; name: string; slug: string; status: Product["status"] };
}

const EMPTY_FORM = { label: "", icon: "💡", positionX: "50", positionY: "50", order: "0", productId: "" };

export default function SceneHotspotsPage() {
  const { accessToken } = useAuth();
  const [hotspots, setHotspots] = useState<Hotspot[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [productQuery, setProductQuery] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function load() {
    api.get<Hotspot[]>("/scene/admin/hotspots", accessToken).then(setHotspots).catch(() => {});
  }

  useEffect(load, [accessToken]);
  useEffect(() => {
    api.get<{ items: Product[] }>("/products?take=200", accessToken).then((res) => setProducts(res.items)).catch(() => {});
  }, [accessToken]);

  const filteredProducts = productQuery
    ? products.filter((p) => p.name.toLowerCase().includes(productQuery.toLowerCase()))
    : products.slice(0, 20);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.productId) {
      setError("یک محصول واقعی از لیست انتخاب کنید");
      return;
    }
    setSaving(true);
    try {
      await api.post(
        "/scene/admin/hotspots",
        {
          label: form.label,
          icon: form.icon,
          positionX: Number(form.positionX),
          positionY: Number(form.positionY),
          positionZ: 0,
          order: Number(form.order),
          productId: form.productId,
        },
        accessToken,
      );
      setForm(EMPTY_FORM);
      setProductQuery("");
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "ثبت نقطه تعاملی ناموفق بود");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(h: Hotspot) {
    await api.patch(`/scene/admin/hotspots/${h.id}`, { isActive: !h.isActive }, accessToken);
    load();
  }

  async function handleDelete(id: string) {
    await api.delete(`/scene/admin/hotspots/${id}`, accessToken);
    load();
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">نقاط تعاملی نمایشگر خانه هوشمند</h1>
      <AdminHelp storageKey="scene-hotspots">
        <p>هر نقطه تعاملی یک نشانگر قابل کلیک روی تصویر نمایشگر خانه هوشمند صفحه اصلی است که به یک محصول واقعی از کاتالوگ وصل می‌شود — هرگز محصول ساختگی نمایش داده نمی‌شود.</p>
        <p>مقادیر X و Y درصد فاصله از چپ و بالای تصویر هستند (هر دو بین ۰ تا ۱۰۰). مثلاً X=50, Y=50 دقیقاً وسط تصویر است. فقط نقاط «فعال» در سایت نمایش داده می‌شوند.</p>
      </AdminHelp>

      <form onSubmit={handleCreate} className="mb-6 grid grid-cols-2 gap-2 rounded-xl border border-border-color p-4 sm:grid-cols-6">
        <input
          required
          placeholder="برچسب (مثلاً لامپ پذیرایی)"
          value={form.label}
          onChange={(e) => setForm({ ...form, label: e.target.value })}
          className="col-span-2 rounded-lg border border-border-color bg-background px-2 py-1 text-sm"
        />
        <input
          placeholder="آیکون"
          value={form.icon}
          onChange={(e) => setForm({ ...form, icon: e.target.value })}
          className="rounded-lg border border-border-color bg-background px-2 py-1 text-sm"
        />
        <input
          type="number"
          min={0}
          max={100}
          step="1"
          placeholder="X (٪ از چپ)"
          value={form.positionX}
          onChange={(e) => setForm({ ...form, positionX: e.target.value })}
          className="rounded-lg border border-border-color bg-background px-2 py-1 text-sm"
        />
        <input
          type="number"
          min={0}
          max={100}
          step="1"
          placeholder="Y (٪ از بالا)"
          value={form.positionY}
          onChange={(e) => setForm({ ...form, positionY: e.target.value })}
          className="rounded-lg border border-border-color bg-background px-2 py-1 text-sm"
        />

        <div className="col-span-2 sm:col-span-3">
          <input
            placeholder="جستجوی محصول واقعی..."
            value={productQuery}
            onChange={(e) => setProductQuery(e.target.value)}
            className="w-full rounded-lg border border-border-color bg-background px-2 py-1 text-sm"
          />
          <select
            required
            value={form.productId}
            onChange={(e) => setForm({ ...form, productId: e.target.value })}
            className="mt-1 w-full rounded-lg border border-border-color bg-background px-2 py-1 text-sm"
          >
            <option value="">— انتخاب محصول —</option>
            {filteredProducts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} {p.status !== "PUBLISHED" ? `(${p.status})` : ""}
              </option>
            ))}
          </select>
        </div>
        <input
          type="number"
          placeholder="ترتیب نمایش"
          value={form.order}
          onChange={(e) => setForm({ ...form, order: e.target.value })}
          className="rounded-lg border border-border-color bg-background px-2 py-1 text-sm"
        />
        <button disabled={saving} className="col-span-2 rounded-lg bg-brand px-3 py-1.5 text-sm font-bold text-[#0b0e14] disabled:opacity-50 sm:col-span-6">
          {saving ? "در حال ثبت..." : "افزودن نقطه تعاملی"}
        </button>
        {error && <p className="col-span-2 text-sm text-red-500 sm:col-span-6">{error}</p>}
      </form>

      <div className="overflow-x-auto rounded-xl border border-border-color">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-right">
            <tr>
              <th className="p-3">برچسب</th>
              <th className="p-3">محصول</th>
              <th className="p-3">موقعیت</th>
              <th className="p-3">وضعیت</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {hotspots.map((h) => (
              <tr key={h.id} className="border-t border-border-color">
                <td className="p-3">
                  {h.icon} {h.label}
                </td>
                <td className="p-3">
                  {h.product.name}
                  {h.product.status !== "PUBLISHED" && <span className="mr-2 text-xs text-amber-400">({h.product.status} — مخفی در سایت)</span>}
                </td>
                <td className="p-3 text-xs text-foreground/60">
                  X: {h.positionX}٪, Y: {h.positionY}٪
                </td>
                <td className="p-3">
                  <button onClick={() => toggleActive(h)} className={`rounded-full px-2 py-0.5 text-xs ${h.isActive ? "bg-emerald-500/20 text-emerald-400" : "bg-surface-2 text-foreground/50"}`}>
                    {h.isActive ? "فعال" : "غیرفعال"}
                  </button>
                </td>
                <td className="p-3">
                  <button onClick={() => handleDelete(h.id)} className="text-xs text-red-400 hover:underline">
                    حذف
                  </button>
                </td>
              </tr>
            ))}
            {hotspots.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-foreground/50">
                  هنوز نقطه تعاملی ثبت نشده است.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
