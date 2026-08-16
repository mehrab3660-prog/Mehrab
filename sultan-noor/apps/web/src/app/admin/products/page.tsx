"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Product } from "@/lib/types";

export default function AdminProductsPage() {
  const { accessToken } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [form, setForm] = useState({ name: "", slug: "", basePrice: "" });
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!accessToken) return;
    const [published, drafts] = await Promise.all([
      api.get<{ items: Product[] }>("/products?status=PUBLISHED&take=100", accessToken),
      api.get<{ items: Product[] }>("/products?status=DRAFT&take=100", accessToken),
    ]);
    setProducts([...drafts.items, ...published.items]);
  }

  useEffect(() => {
    load();
  }, [accessToken]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post(
        "/products",
        { name: form.name, slug: form.slug, basePrice: Number(form.basePrice), status: "PUBLISHED" },
        accessToken,
      );
      setForm({ name: "", slug: "", basePrice: "" });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "خطا در ایجاد محصول");
    }
  }

  async function handleDelete(id: string) {
    await api.delete(`/products/${id}`, accessToken);
    load();
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">مدیریت محصولات</h1>

      <form onSubmit={handleCreate} className="mb-8 grid grid-cols-4 gap-2 rounded-lg border border-border-color p-4">
        <input
          required
          placeholder="نام محصول"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="rounded-lg border border-border-color bg-background px-2 py-1 text-sm"
        />
        <input
          required
          placeholder="اسلاگ (انگلیسی)"
          value={form.slug}
          onChange={(e) => setForm({ ...form, slug: e.target.value })}
          className="rounded-lg border border-border-color bg-background px-2 py-1 text-sm"
        />
        <input
          required
          type="number"
          placeholder="قیمت پایه (تومان)"
          value={form.basePrice}
          onChange={(e) => setForm({ ...form, basePrice: e.target.value })}
          className="rounded-lg border border-border-color bg-background px-2 py-1 text-sm"
        />
        <button className="rounded-lg bg-brand px-3 py-1 text-sm text-[#0b0e14]">افزودن محصول</button>
        {error && <p className="col-span-4 text-sm text-red-500">{error}</p>}
      </form>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border-color text-right">
            <th className="p-2">نام</th>
            <th className="p-2">وضعیت</th>
            <th className="p-2">قیمت</th>
            <th className="p-2"></th>
          </tr>
        </thead>
        <tbody>
          {products.map((p) => (
            <tr key={p.id} className="border-b border-border-color">
              <td className="p-2">{p.name}</td>
              <td className="p-2">{p.status}</td>
              <td className="p-2">{Number(p.basePrice).toLocaleString("fa-IR")} تومان</td>
              <td className="p-2">
                <button onClick={() => handleDelete(p.id)} className="text-red-500">
                  حذف
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
