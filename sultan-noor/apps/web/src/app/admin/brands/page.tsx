"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Brand } from "@/lib/types";
import AdminHelp from "@/components/admin/AdminHelp";

export default function AdminBrandsPage() {
  const { accessToken } = useAuth();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [form, setForm] = useState({ name: "", slug: "" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: "", slug: "" });

  function load() {
    api.get<Brand[]>("/brands").then(setBrands);
  }

  useEffect(load, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    await api.post("/brands", form, accessToken);
    setForm({ name: "", slug: "" });
    load();
  }

  async function handleDelete(id: string) {
    await api.delete(`/brands/${id}`, accessToken);
    load();
  }

  function startEdit(b: Brand) {
    setEditingId(b.id);
    setEditForm({ name: b.name, slug: b.slug });
  }

  async function handleEditSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    await api.patch(`/brands/${editingId}`, editForm, accessToken);
    setEditingId(null);
    load();
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">برندها</h1>
      <AdminHelp storageKey="brands">
        <p>این بخش برای ثبت برند سازنده‌ی محصولات است (مثلاً «فیلیپس» یا «پارس شعاع توس»). بعد از ساخت برند، می‌توانید هنگام ویرایش یک محصول آن را به این برند وصل کنید.</p>
        <p>«نام برند» را به فارسی و «اسلاگ» را انگلیسی و بدون فاصله وارد کنید (مثلاً philips).</p>
      </AdminHelp>
      <form onSubmit={handleCreate} className="mb-6 flex gap-2">
        <input
          required
          placeholder="نام برند"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="rounded-lg border border-border-color bg-background px-2 py-1 text-sm"
        />
        <input
          required
          placeholder="اسلاگ"
          value={form.slug}
          onChange={(e) => setForm({ ...form, slug: e.target.value })}
          className="rounded-lg border border-border-color bg-background px-2 py-1 text-sm"
        />
        <button className="rounded-lg bg-brand px-3 py-1 text-sm text-[#0b0e14]">افزودن</button>
      </form>
      <ul className="space-y-1">
        {brands.map((b) =>
          editingId === b.id ? (
            <li key={b.id} className="rounded-lg border border-border-color bg-surface p-2 text-sm">
              <form onSubmit={handleEditSave} className="flex flex-wrap items-center gap-2">
                <input
                  required
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="rounded-lg border border-border-color bg-background px-2 py-1 text-sm"
                />
                <input
                  required
                  value={editForm.slug}
                  onChange={(e) => setEditForm({ ...editForm, slug: e.target.value })}
                  className="rounded-lg border border-border-color bg-background px-2 py-1 text-sm"
                />
                <button className="rounded-lg bg-brand px-3 py-1 text-xs font-bold text-[#0b0e14]">ذخیره</button>
                <button type="button" onClick={() => setEditingId(null)} className="text-xs text-foreground/60">
                  انصراف
                </button>
              </form>
            </li>
          ) : (
            <li key={b.id} className="flex items-center justify-between rounded-lg border border-border-color p-2 text-sm">
              {b.name}
              <span className="flex gap-3">
                <button onClick={() => startEdit(b)} className="text-brand">
                  ویرایش
                </button>
                <button onClick={() => handleDelete(b.id)} className="text-red-500">
                  حذف
                </button>
              </span>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}
