"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { BlogPost } from "@/lib/types";
import AdminHelp from "@/components/admin/AdminHelp";

interface AdminBlogPost extends BlogPost {
  isPublished: boolean;
}

const EMPTY_FORM = { title: "", slug: "", excerpt: "", content: "", coverImageUrl: "" };

export default function AdminBlogPage() {
  const { accessToken } = useAuth();
  const { toast } = useToast();
  const [posts, setPosts] = useState<AdminBlogPost[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(EMPTY_FORM);

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

  function startEdit(post: AdminBlogPost) {
    setEditingId(post.id);
    setEditForm({
      title: post.title,
      slug: post.slug,
      excerpt: post.excerpt ?? "",
      content: post.content,
      coverImageUrl: post.coverImageUrl ?? "",
    });
  }

  async function handleEditSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    try {
      await api.patch(
        `/blog/${editingId}`,
        {
          title: editForm.title,
          slug: editForm.slug,
          excerpt: editForm.excerpt || undefined,
          content: editForm.content,
          coverImageUrl: editForm.coverImageUrl || undefined,
        },
        accessToken,
      );
      setEditingId(null);
      toast("مقاله ذخیره شد.", "success");
      load();
    } catch {
      toast("ذخیره‌ی مقاله با خطا مواجه شد.", "error");
    }
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

      <AdminHelp storageKey="blog">
        <p>مقاله‌های این بخش در صفحه‌ی وبلاگ سایت نمایش داده می‌شوند و می‌توانند برای سئو و جذب مشتری از گوگل مفید باشند.</p>
        <p>وقتی مقاله‌ای می‌سازید، به‌صورت «پیش‌نویس» ذخیره می‌شود و هنوز برای بازدیدکنندگان قابل دیدن نیست. برای نمایش عمومی آن، روی «انتشار» در پایین همان مقاله بزنید. هر زمان هم می‌توانید آن را به پیش‌نویس برگردانید تا موقتاً از سایت پنهان شود.</p>
        <p>«اسلاگ» یعنی نسخه‌ی انگلیسی و بدون فاصله‌ی عنوان که در آدرس اینترنتی مقاله استفاده می‌شود.</p>
      </AdminHelp>

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
        {posts.map((p) =>
          editingId === p.id ? (
            <li key={p.id} className="rounded-lg border border-border-color bg-surface p-3 text-sm">
              <form onSubmit={handleEditSave} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <input
                  required
                  placeholder="عنوان"
                  value={editForm.title}
                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                  className="rounded-lg border border-border-color bg-background px-2 py-1 text-sm"
                />
                <input
                  required
                  placeholder="اسلاگ"
                  value={editForm.slug}
                  onChange={(e) => setEditForm({ ...editForm, slug: e.target.value })}
                  className="rounded-lg border border-border-color bg-background px-2 py-1 text-sm"
                />
                <input
                  placeholder="خلاصه (اختیاری)"
                  value={editForm.excerpt}
                  onChange={(e) => setEditForm({ ...editForm, excerpt: e.target.value })}
                  className="col-span-full rounded-lg border border-border-color bg-background px-2 py-1 text-sm"
                />
                <input
                  placeholder="آدرس تصویر کاور (اختیاری)"
                  value={editForm.coverImageUrl}
                  onChange={(e) => setEditForm({ ...editForm, coverImageUrl: e.target.value })}
                  className="col-span-full rounded-lg border border-border-color bg-background px-2 py-1 text-sm"
                />
                <textarea
                  required
                  placeholder="متن مقاله"
                  value={editForm.content}
                  onChange={(e) => setEditForm({ ...editForm, content: e.target.value })}
                  rows={4}
                  className="col-span-full rounded-lg border border-border-color bg-background px-2 py-1 text-sm"
                />
                <div className="col-span-full flex gap-2">
                  <button className="rounded-lg bg-brand px-3 py-1.5 text-sm font-bold text-[#0b0e14]">ذخیره تغییرات</button>
                  <button type="button" onClick={() => setEditingId(null)} className="rounded-lg border border-border-color px-3 py-1.5 text-sm">
                    انصراف
                  </button>
                </div>
              </form>
            </li>
          ) : (
            <li key={p.id} className="rounded-lg border border-border-color p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-bold">{p.title}</span>
                <span className={p.isPublished ? "text-brand" : "text-foreground/50"}>{p.isPublished ? "منتشرشده" : "پیش‌نویس"}</span>
              </div>
              {p.excerpt && <p className="mt-1 text-foreground/60">{p.excerpt}</p>}
              <div className="mt-2 flex gap-3 text-xs">
                <button onClick={() => startEdit(p)} className="text-brand">
                  ویرایش
                </button>
                <button onClick={() => togglePublished(p)} className="text-brand">
                  {p.isPublished ? "بازگرداندن به پیش‌نویس" : "انتشار"}
                </button>
                <button onClick={() => handleDelete(p.id)} className="text-red-500">
                  حذف
                </button>
              </div>
            </li>
          ),
        )}
        {posts.length === 0 && <p className="text-sm text-foreground/50">هنوز مقاله‌ای ثبت نشده است.</p>}
      </ul>
    </div>
  );
}
