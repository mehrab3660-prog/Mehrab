"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Category } from "@/lib/types";

export default function AdminCategoriesPage() {
  const { accessToken } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState({ name: "", slug: "" });

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

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">دسته‌بندی‌ها</h1>
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
        {categories.map((c) => (
          <li key={c.id} className="flex items-center justify-between rounded-lg border border-border-color p-2 text-sm">
            {c.name}
            <button onClick={() => handleDelete(c.id)} className="text-red-500">
              حذف
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
