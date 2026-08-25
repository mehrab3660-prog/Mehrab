"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Banner } from "@/lib/types";
import AdminHelp from "@/components/admin/AdminHelp";

const PLACEMENTS = ["HOME_HERO", "HOME_SECONDARY", "CATEGORY_TOP", "SIDEBAR"];

export default function AdminBannersPage() {
  const { accessToken } = useAuth();
  const [banners, setBanners] = useState<Banner[]>([]);
  const [form, setForm] = useState({ title: "", imageUrl: "", placement: "HOME_HERO" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ title: "", imageUrl: "", placement: "HOME_HERO" });

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

  function startEdit(b: Banner) {
    setEditingId(b.id);
    setEditForm({ title: b.title, imageUrl: b.imageUrl, placement: b.placement });
  }

  async function handleEditSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    await api.patch(`/banners/${editingId}`, editForm, accessToken);
    setEditingId(null);
    load();
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">بنرهای تبلیغاتی</h1>
      <AdminHelp storageKey="banners">
        <p>بنرها همان تصاویر تبلیغاتی‌ای هستند که در صفحه اصلی یا بالای دسته‌بندی‌ها نمایش داده می‌شوند.</p>
        <p>در «آدرس تصویر» باید لینک مستقیم یک عکس را وارد کنید (عکس باید از قبل جایی آپلود شده باشد و لینک آن را داشته باشید).</p>
        <p>در «محل نمایش»: HOME_HERO یعنی اسلایدر بزرگ بالای صفحه اصلی، HOME_SECONDARY یعنی بنرهای کوچک‌تر صفحه اصلی، CATEGORY_TOP یعنی بالای صفحه‌ی یک دسته‌بندی، و SIDEBAR یعنی نوار کناری.</p>
      </AdminHelp>
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
        {banners.map((b) =>
          editingId === b.id ? (
            <li key={b.id} className="rounded-lg border border-border-color bg-surface p-2 text-sm">
              <form onSubmit={handleEditSave} className="grid grid-cols-3 gap-2">
                <input
                  required
                  placeholder="عنوان"
                  value={editForm.title}
                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                  className="rounded-lg border border-border-color bg-background px-2 py-1 text-sm"
                />
                <input
                  required
                  placeholder="آدرس تصویر"
                  value={editForm.imageUrl}
                  onChange={(e) => setEditForm({ ...editForm, imageUrl: e.target.value })}
                  className="rounded-lg border border-border-color bg-background px-2 py-1 text-sm"
                />
                <select
                  value={editForm.placement}
                  onChange={(e) => setEditForm({ ...editForm, placement: e.target.value })}
                  className="rounded-lg border border-border-color bg-background px-2 py-1 text-sm"
                >
                  {PLACEMENTS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
                <div className="col-span-3 flex gap-2">
                  <button className="rounded-lg bg-brand px-3 py-1 text-xs font-bold text-[#0b0e14]">ذخیره</button>
                  <button type="button" onClick={() => setEditingId(null)} className="text-xs text-foreground/60">
                    انصراف
                  </button>
                </div>
              </form>
            </li>
          ) : (
            <li key={b.id} className="flex items-center justify-between rounded-lg border border-border-color p-2 text-sm">
              {b.title} — {b.placement}
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
