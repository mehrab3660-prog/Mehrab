"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { BlogPost } from "@/lib/types";

interface AdminBlogPost extends BlogPost {
  isPublished: boolean;
}

const EMPTY_FORM = { title: "", slug: "", excerpt: "", content: "", coverImageUrl: "" };

export default function AdminBlogPage() {
  const { accessToken } = useAuth();
  const { toast } = useToast();
  const [posts, setPosts] = useState<AdminBlogPost[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);

  function load() {
    if (!accessToken) return;
    api.get<AdminBlogPost[]>("/blog/admin", accessToken).then(setPosts);
  }

  useEffect(load, [accessToken]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.post("/blog", form, accessToken);
      setForm(EMPTY_FORM);
      toast("مقاله ایجاد شد.", "success");
      load();
    } catch {
      toast("ایجاد مقاله با خطا مواجه شد.", "error");
    }
  }

  async function togglePublished(post: AdminBlogPost) {
    await api.patch(`/blog/${post.id}`, { isPublished: !post.isPublished }, accessToken);
    load();
  }

  async function handleDelete(id: string) {
    try {
      await api.delete(`/blog/${id}`, accessToken);
      load();
    } catch {
      toast("حذف مقاله با خطا مواجه شد.", "error");
    }
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">مدیریت وبلاگ</h1>

      <form onSubmit={handleCreate} className="mb-6 grid grid-cols-1 gap-2 rounded-lg border border-border-color p-3 sm:grid-cols-2">
        <input
          required
          placeholder="عنوان"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          className="rounded-lg border border-border-color bg-background px-2 py-1 text-sm"
        />
        <input
          required
          placeholder="اسلاگ"
          value={form.slug}
          onChange={(e) => setForm({ ...form, slug: e.target.value })}
          className="rounded-lg border border-border-color bg-background px-2 py-1 text-sm"
        />
        <input
          placeholder="خلاصه (اختیاری)"
          value={form.excerpt}
          onChange={(e) => setForm({ ...form, excerpt: e.target.value })}
          className="col-span-full rounded-lg border border-border-color bg-background px-2 py-1 text-sm"
        />
        <input
          placeholder="آدرس تصویر کاور (اختیاری)"
          value={form.coverImageUrl}
          onChange={(e) => setForm({ ...form, coverImageUrl: e.target.value })}
          className="col-span-full rounded-lg border border-border-color bg-background px-2 py-1 text-sm"
        />
        <textarea
          required
          placeholder="متن مقاله"
          value={form.content}
          onChange={(e) => setForm({ ...form, content: e.target.value })}
          rows={4}
          className="col-span-full rounded-lg border border-border-color bg-background px-2 py-1 text-sm"
        />
        <button className="col-span-full rounded-lg bg-brand px-3 py-1.5 text-sm text-[#0b0e14]">ایجاد مقاله (پیش‌نویس)</button>
      </form>

      <ul className="space-y-2">
        {posts.map((p) => (
          <li key={p.id} className="rounded-lg border border-border-color p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-bold">{p.title}</span>
              <span className={p.isPublished ? "text-brand" : "text-foreground/50"}>{p.isPublished ? "منتشرشده" : "پیش‌نویس"}</span>
            </div>
            {p.excerpt && <p className="mt-1 text-foreground/60">{p.excerpt}</p>}
            <div className="mt-2 flex gap-3 text-xs">
              <button onClick={() => togglePublished(p)} className="text-brand">
                {p.isPublished ? "بازگرداندن به پیش‌نویس" : "انتشار"}
              </button>
              <button onClick={() => handleDelete(p.id)} className="text-red-500">
                حذف
              </button>
            </div>
          </li>
        ))}
        {posts.length === 0 && <p className="text-sm text-foreground/50">هنوز مقاله‌ای ثبت نشده است.</p>}
      </ul>
    </div>
  );
}
