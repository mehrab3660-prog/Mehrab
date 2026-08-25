"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { Category, Product, SalesRecommendation, SalesRecommendationType } from "@/lib/types";
import AdminHelp from "@/components/admin/AdminHelp";

const TYPE_LABEL: Record<SalesRecommendationType, string> = {
  CROSS_SELL: "فروش مرتبط",
  BUNDLE: "پک پیشنهادی",
  DISCOUNT: "تخفیف",
  CAMPAIGN: "کمپین",
  ABANDONED_CART: "سبد رهاشده",
};

const STATUS_LABEL: Record<SalesRecommendation["status"], string> = {
  PENDING_REVIEW: "در انتظار بررسی",
  APPROVED: "تأیید شده",
  REJECTED: "رد شده",
  ACTIVE: "فعال",
};

const STATUS_STYLE: Record<SalesRecommendation["status"], string> = {
  PENDING_REVIEW: "bg-brand/10 text-brand",
  APPROVED: "bg-blue-500/10 text-blue-500",
  REJECTED: "bg-red-500/10 text-red-500",
  ACTIVE: "bg-green-500/10 text-green-500",
};

const SEVERITY_STYLE: Record<SalesRecommendation["severity"], string> = {
  CRITICAL: "border-red-600",
  HIGH: "border-red-500/50",
  MEDIUM: "border-amber-500/50",
  LOW: "border-border-color",
};

export default function SalesRecommendationsPage() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<SalesRecommendation[] | null>(null);
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  const [discountProductId, setDiscountProductId] = useState("");
  const [generatingDiscount, setGeneratingDiscount] = useState(false);

  const [campaignTopic, setCampaignTopic] = useState("");
  const [campaignCategoryId, setCampaignCategoryId] = useState("");
  const [generatingCampaign, setGeneratingCampaign] = useState(false);

  function load() {
    if (!accessToken) return;
    const query = [typeFilter && `type=${typeFilter}`, statusFilter && `status=${statusFilter}`].filter(Boolean).join("&");
    api.get<SalesRecommendation[]>(`/sales/recommendations${query ? `?${query}` : ""}`, accessToken).then(setItems);
  }

  useEffect(load, [accessToken, typeFilter, statusFilter]);

  useEffect(() => {
    if (!accessToken) return;
    Promise.all([
      api.get<{ items: Product[] }>("/products?status=PUBLISHED&take=200", accessToken),
      api.get<Category[]>("/categories"),
    ]).then(([p, c]) => {
      setProducts(p.items);
      setCategories(c);
    });
  }, [accessToken]);

  async function handleGenerateDiscount(e: React.FormEvent) {
    e.preventDefault();
    if (!discountProductId) return;
    setGeneratingDiscount(true);
    try {
      const rec = await api.post<SalesRecommendation>("/sales/recommendations/discount/generate", { productId: discountProductId }, accessToken);
      toast("پیشنهاد تخفیف ساخته شد.", "success");
      router.push(`/admin/sales-recommendations/${rec.id}`);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "ساخت پیشنهاد تخفیف با خطا مواجه شد.", "error");
    } finally {
      setGeneratingDiscount(false);
    }
  }

  async function handleGenerateCampaign(e: React.FormEvent) {
    e.preventDefault();
    if (!campaignTopic.trim() || !campaignCategoryId) return;
    setGeneratingCampaign(true);
    try {
      const rec = await api.post<SalesRecommendation>("/sales/recommendations/campaign/generate", { topic: campaignTopic.trim(), categoryId: campaignCategoryId }, accessToken);
      toast("پیشنهاد کمپین ساخته شد.", "success");
      router.push(`/admin/sales-recommendations/${rec.id}`);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "ساخت پیشنهاد کمپین با خطا مواجه شد.", "error");
    } finally {
      setGeneratingCampaign(false);
    }
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">پیشنهادهای فروش AI</h1>

      <AdminHelp storageKey="sales-recommendations">
        <p>هر پیشنهاد بر پایه داده واقعی فروشگاه ساخته می‌شود و دلیل آن را نشان می‌دهد. هیچ پیشنهادی به‌تنهایی قیمت، تخفیف، کمپین یا موجودی واقعی را تغییر نمی‌دهد.</p>
        <p>برای تخفیف یا کمپین، هوش مصنوعی فقط یک پیش‌نویس برای بررسی شما می‌سازد — تغییر واقعی قیمت همیشه یک اقدام دستی جداگانه در بخش «قیمت‌گذاری» است.</p>
      </AdminHelp>

      <div className="mb-8 grid gap-4 sm:grid-cols-2">
        <form onSubmit={handleGenerateDiscount} className="space-y-2 rounded-lg border border-border-color p-4">
          <h2 className="font-bold">ساخت پیشنهاد تخفیف</h2>
          <select value={discountProductId} onChange={(e) => setDiscountProductId(e.target.value)} className="w-full rounded-lg border border-border-color bg-background px-3 py-2 text-sm">
            <option value="">— انتخاب محصول —</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button type="submit" disabled={!discountProductId || generatingDiscount} className="w-full rounded-lg bg-brand px-4 py-2 text-sm font-bold text-[#0b0e14] disabled:opacity-50">
            {generatingDiscount ? "در حال ساخت..." : "ساخت پیشنهاد تخفیف"}
          </button>
        </form>

        <form onSubmit={handleGenerateCampaign} className="space-y-2 rounded-lg border border-border-color p-4">
          <h2 className="font-bold">ساخت پیشنهاد کمپین</h2>
          <input
            value={campaignTopic}
            onChange={(e) => setCampaignTopic(e.target.value)}
            placeholder="موضوع کمپین"
            className="w-full rounded-lg border border-border-color bg-background px-3 py-2 text-sm"
          />
          <select value={campaignCategoryId} onChange={(e) => setCampaignCategoryId(e.target.value)} className="w-full rounded-lg border border-border-color bg-background px-3 py-2 text-sm">
            <option value="">— انتخاب دسته‌بندی —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={!campaignTopic.trim() || !campaignCategoryId || generatingCampaign}
            className="w-full rounded-lg bg-brand px-4 py-2 text-sm font-bold text-[#0b0e14] disabled:opacity-50"
          >
            {generatingCampaign ? "در حال ساخت..." : "ساخت پیشنهاد کمپین"}
          </button>
        </form>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="rounded-lg border border-border-color bg-background px-3 py-2 text-sm">
          <option value="">همه انواع</option>
          {(Object.keys(TYPE_LABEL) as SalesRecommendationType[]).map((t) => (
            <option key={t} value={t}>
              {TYPE_LABEL[t]}
            </option>
          ))}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-lg border border-border-color bg-background px-3 py-2 text-sm">
          <option value="">همه وضعیت‌ها</option>
          {(Object.keys(STATUS_LABEL) as SalesRecommendation["status"][]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </div>

      {items === null ? (
        <p className="text-sm text-foreground/50">در حال بارگذاری...</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-foreground/50">پیشنهادی وجود ندارد.</p>
      ) : (
        <div className="space-y-2">
          {items.map((r) => (
            <Link
              key={r.id}
              href={`/admin/sales-recommendations/${r.id}`}
              className={`flex items-center justify-between rounded-lg border-r-4 border border-border-color p-3 text-sm hover:border-brand ${SEVERITY_STYLE[r.severity]}`}
            >
              <div>
                <p className="font-bold">{r.title}</p>
                <p className="text-xs text-foreground/50">{TYPE_LABEL[r.type]}</p>
              </div>
              <span className={`rounded px-2 py-0.5 text-xs ${STATUS_STYLE[r.status]}`}>{STATUS_LABEL[r.status]}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
