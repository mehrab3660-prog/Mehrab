"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Category } from "@/lib/types";
import AdminHelp from "@/components/admin/AdminHelp";

export default function AdminCategoriesPage() {
  const { accessToken } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState({ name: "", slug: "" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: "", slug: "" });

  function load() {
    api.get<Category[]>("/categories").then(setCategories);
  }

  useEffect(load, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    await api.post("/categories", form, accessToken);
    setForm({ name: "", slug: "" });
    load();
  }

  async function handleDelete(id: string) {
    await api.delete(`/categories/${id}`, accessToken);
    load();
  }

  function startEdit(c: Category) {
    setEditingId(c.id);
    setEditForm({ name: c.name, slug: c.slug });
  }

  async function handleEditSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    await api.patch(`/categories/${editingId}`, editForm, accessToken);
    setEditingId(null);
    load();
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">دسته‌بندی‌ها</h1>
      <AdminHelp storageKey="categories">
        <p>دسته‌بندی‌ها همان بخش‌هایی هستند که محصولات فروشگاه در آن‌ها قرار می‌گیرند (مثلاً «لامپ»، «کلید و پریز»). این‌ها در منوی سایت هم به مشتری نشان داده می‌شوند.</p>
        <p>برای افزودن دسته‌ی جدید، «نام دسته» (مثلاً روشنایی) و «اسلاگ» (نسخه‌ی انگلیسی و بدون فاصله‌ی همان نام، مثلاً roshanaei یا lighting) را وارد و «افزودن» را بزنید.</p>
        <p>قبل از حذف یک دسته، بهتر است مطمئن شوید محصولی در آن دسته باقی نمانده باشد.</p>
      </AdminHelp>
      <form onSubmit={handleCreate} className="mb-6 flex gap-2">
        <input
          required
          placeholder="نام دسته"
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
        {categories.map((c) =>
          editingId === c.id ? (
            <li key={c.id} className="rounded-lg border border-border-color bg-surface p-2 text-sm">
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
            <li key={c.id} className="flex items-center justify-between rounded-lg border border-border-color p-2 text-sm">
              {c.name}
              <span className="flex gap-3">
                <button onClick={() => startEdit(c)} className="text-brand">
                  ویرایش
                </button>
                <button onClick={() => handleDelete(c.id)} className="text-red-500">
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
