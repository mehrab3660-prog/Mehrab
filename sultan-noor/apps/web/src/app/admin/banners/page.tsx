"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Banner } from "@/lib/types";

const PLACEMENTS = ["HOME_HERO", "HOME_SECONDARY", "CATEGORY_TOP", "SIDEBAR"];

export default function AdminBannersPage() {
  const { accessToken } = useAuth();
  const [banners, setBanners] = useState<Banner[]>([]);
  const [form, setForm] = useState({ title: "", imageUrl: "", placement: "HOME_HERO" });

  function load() {
    if (!accessToken) return;
    api.get<Banner[]>("/banners/admin", accessToken).then(setBanners);
  }

  useEffect(load, [accessToken]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    await api.post("/banners", form, accessToken);
    setForm({ title: "", imageUrl: "", placement: "HOME_HERO" });
    load();
  }

  async function handleDelete(id: string) {
    await api.delete(`/banners/${id}`, accessToken);
    load();
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">بنرهای تبلیغاتی</h1>
      <form onSubmit={handleCreate} className="mb-6 grid grid-cols-3 gap-2">
        <input
          required
          placeholder="عنوان"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          className="rounded-lg border border-border-color bg-background px-2 py-1 text-sm"
        />
        <input
          required
          placeholder="آدرس تصویر"
          value={form.imageUrl}
          onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
          className="rounded-lg border border-border-color bg-background px-2 py-1 text-sm"
        />
        <select
          value={form.placement}
          onChange={(e) => setForm({ ...form, placement: e.target.value })}
          className="rounded-lg border border-border-color bg-background px-2 py-1 text-sm"
        >
          {PLACEMENTS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <button className="col-span-3 rounded-lg bg-brand px-3 py-1 text-sm text-[#0b0e14]">افزودن بنر</button>
      </form>
      <ul className="space-y-1">
        {banners.map((b) => (
          <li key={b.id} className="flex items-center justify-between rounded-lg border border-border-color p-2 text-sm">
            {b.title} — {b.placement}
            <button onClick={() => handleDelete(b.id)} className="text-red-500">
              حذف
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
