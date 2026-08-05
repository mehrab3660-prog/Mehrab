"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Brand } from "@/lib/types";

export default function AdminBrandsPage() {
  const { accessToken } = useAuth();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [form, setForm] = useState({ name: "", slug: "" });

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

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">برندها</h1>
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
        <button className="rounded-lg bg-brand px-3 py-1 text-sm text-white">افزودن</button>
      </form>
      <ul className="space-y-1">
        {brands.map((b) => (
          <li key={b.id} className="flex items-center justify-between rounded-lg border border-border-color p-2 text-sm">
            {b.name}
            <button onClick={() => handleDelete(b.id)} className="text-red-500">
              حذف
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
