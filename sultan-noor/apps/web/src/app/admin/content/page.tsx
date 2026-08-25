"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { Category, ContentDraft, ContentDraftType, Product } from "@/lib/types";
import AdminHelp from "@/components/admin/AdminHelp";

const TYPE_LABEL: Record<ContentDraftType, string> = {
  BLOG_POST: "مقاله وبلاگ",
  BUYING_GUIDE: "راهنمای خرید",
  COMPARISON: "مقایسه دو محصول",
  FAQ: "پرسش‌های متداول",
  EDUCATIONAL_ARTICLE: "مقاله آموزشی",
  PRODUCT_INTRO: "معرفی محصول",
  CATEGORY_CONTENT: "محتوای دسته‌بندی",
};

const STATUS_LABEL: Record<ContentDraft["status"], string> = {
  PENDING_REVIEW: "در انتظار بررسی",
  APPROVED: "تأیید شده",
  REJECTED: "رد شده",
  PUBLISHED: "منتشرشده",
};

const STATUS_STYLE: Record<ContentDraft["status"], string> = {
  PENDING_REVIEW: "bg-brand/10 text-brand",
  APPROVED: "bg-blue-500/10 text-blue-500",
  REJECTED: "bg-red-500/10 text-red-500",
  PUBLISHED: "bg-green-500/10 text-green-500",
};

const NEEDS_PRODUCT: ContentDraftType[] = ["PRODUCT_INTRO"];
const NEEDS_CATEGORY: ContentDraftType[] = ["CATEGORY_CONTENT"];

export default function AdminContentPage() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const { toast } = useToast();
  const [drafts, setDrafts] = useState<ContentDraft[] | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  const [type, setType] = useState<ContentDraftType>("BLOG_POST");
  const [topic, setTopic] = useState("");
  const [keywords, setKeywords] = useState("");
  const [productId, setProductId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [generating, setGenerating] = useState(false);

  function load() {
    if (!accessToken) return;
    api.get<ContentDraft[]>("/content-drafts", accessToken).then(setDrafts);
  }

  useEffect(load, [accessToken]);

  useEffect(() => {
    if (!accessToken) return;
    Promise.all([
      api.get<{ items: Product[] }>("/products?status=PUBLISHED&take=200", accessToken),
      api.get<{ items: Product[] }>("/products?status=DRAFT&take=200", accessToken),
      api.get<Category[]>("/categories"),
    ]).then(([published, draftsRes, cats]) => {
      setProducts([...published.items, ...draftsRes.items]);
      setCategories(cats);
    });
  }, [accessToken]);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!topic.trim()) return;
    if (NEEDS_PRODUCT.includes(type) && !productId) {
      toast("برای «معرفی محصول» باید یک محصول انتخاب کنید.", "error");
      return;
    }
    if (NEEDS_CATEGORY.includes(type) && !categoryId) {
      toast("برای «محتوای دسته‌بندی» باید یک دسته‌بندی انتخاب کنید.", "error");
      return;
    }
    setGenerating(true);
    try {
      const draft = await api.post<ContentDraft>(
        "/content-drafts/generate",
        {
          type,
          topic: topic.trim(),
          keywords: keywords.trim() || undefined,
          productId: NEEDS_PRODUCT.includes(type) ? productId : undefined,
          categoryId: NEEDS_CATEGORY.includes(type) ? categoryId : undefined,
        },
        accessToken,
      );
      toast("محتوا ساخته شد — پیش از انتشار بررسی کنید.", "success");
      router.push(`/admin/content/${draft.id}`);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "ساخت محتوا با خطا مواجه شد.", "error");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">تولید محتوای خودکار (Content Autopilot)</h1>

      <AdminHelp storageKey="content-autopilot">
        <p>یک موضوع وارد کنید تا هوش مصنوعی مقاله، راهنمای خرید، مقایسه، پرسش‌های متداول یا محتوای دیگر بسازد. هیچ محتوایی بدون تأیید شما منتشر نمی‌شود.</p>
        <p>«معرفی محصول» توضیحات محصول واقعی را جایگزین می‌کند و «محتوای دسته‌بندی» توضیح دسته‌بندی را — بقیه‌ی انواع به‌عنوان مقاله‌ی وبلاگ منتشر می‌شوند.</p>
      </AdminHelp>

      <form onSubmit={handleGenerate} className="mb-8 grid gap-3 rounded-lg border border-border-color p-4 sm:grid-cols-2">
        <select value={type} onChange={(e) => setType(e.target.value as ContentDraftType)} className="rounded-lg border border-border-color bg-background px-3 py-2 text-sm">
          {(Object.keys(TYPE_LABEL) as ContentDraftType[]).map((t) => (
            <option key={t} value={t}>
              {TYPE_LABEL[t]}
            </option>
          ))}
        </select>
        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="موضوع *"
          required
          className="rounded-lg border border-border-color bg-background px-3 py-2 text-sm"
        />
        <input
          value={keywords}
          onChange={(e) => setKeywords(e.target.value)}
          placeholder="کلمات کلیدی (اختیاری)"
          className="rounded-lg border border-border-color bg-background px-3 py-2 text-sm"
        />
        {NEEDS_PRODUCT.includes(type) && (
          <select value={productId} onChange={(e) => setProductId(e.target.value)} className="rounded-lg border border-border-color bg-background px-3 py-2 text-sm">
            <option value="">— انتخاب محصول *</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
        {NEEDS_CATEGORY.includes(type) && (
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="rounded-lg border border-border-color bg-background px-3 py-2 text-sm">
            <option value="">— انتخاب دسته‌بندی *</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
        <button type="submit" disabled={generating} className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-[#0b0e14] disabled:opacity-50 sm:col-span-2">
          {generating ? "در حال تولید با هوش مصنوعی..." : "تولید محتوا"}
        </button>
      </form>

      <h2 className="mb-3 font-bold">پیش‌نویس‌های محتوا</h2>
      {drafts === null ? (
        <p className="text-sm text-foreground/50">در حال بارگذاری...</p>
      ) : drafts.length === 0 ? (
        <p className="text-sm text-foreground/50">هنوز محتوایی ساخته نشده است.</p>
      ) : (
        <div className="space-y-2">
          {drafts.map((d) => (
            <Link key={d.id} href={`/admin/content/${d.id}`} className="flex items-center justify-between rounded-lg border border-border-color p-3 text-sm hover:border-brand">
              <div>
                <p className="font-bold">{d.title || d.topic}</p>
                <p className="text-xs text-foreground/50">{TYPE_LABEL[d.type]}</p>
              </div>
              <span className={`rounded px-2 py-0.5 text-xs ${STATUS_STYLE[d.status]}`}>{STATUS_LABEL[d.status]}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
