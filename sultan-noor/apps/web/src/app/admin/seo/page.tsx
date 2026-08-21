"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { AiControlCenterData, Product, SeoProblem } from "@/lib/types";
import AdminHelp from "@/components/admin/AdminHelp";

const SEVERITY_LABEL: Record<SeoProblem["severity"], string> = { HIGH: "بالا", MEDIUM: "متوسط", LOW: "پایین" };
const SEVERITY_STYLE: Record<SeoProblem["severity"], string> = {
  HIGH: "border-red-500/40 bg-red-500/5 text-red-500",
  MEDIUM: "border-amber-500/40 bg-amber-500/5 text-amber-500",
  LOW: "border-border-color bg-surface text-foreground/70",
};
const ENTITY_LABEL: Record<SeoProblem["entityType"], string> = { Product: "محصول", Category: "دسته‌بندی", BlogPost: "مقاله" };

export default function AdminSeoPage() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const { toast } = useToast();
  const [problems, setProblems] = useState<SeoProblem[] | null>(null);
  const [pendingSuggestions, setPendingSuggestions] = useState<AiControlCenterData["pendingSeoSuggestions"] | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generatingFor, setGeneratingFor] = useState<string | null>(null);

  function load() {
    if (!accessToken) return;
    Promise.all([
      api.get<SeoProblem[]>("/seo/audit", accessToken),
      api.get<AiControlCenterData>("/dashboard/ai-control-center", accessToken),
      api.get<{ items: Product[] }>("/products?status=PUBLISHED&take=200", accessToken),
      api.get<{ items: Product[] }>("/products?status=DRAFT&take=200", accessToken),
    ]).then(([audit, controlCenter, published, drafts]) => {
      setProblems(audit);
      setPendingSuggestions(controlCenter.pendingSeoSuggestions);
      setProducts([...published.items, ...drafts.items]);
    });
  }

  useEffect(load, [accessToken]);

  async function generateFor(productId: string) {
    if (!productId) return;
    setGeneratingFor(productId);
    try {
      const suggestion = await api.post<{ id: string }>(`/seo/products/${productId}/suggestions`, undefined, accessToken);
      toast("پیشنهاد سئو ساخته شد.", "success");
      router.push(`/admin/seo/${suggestion.id}`);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "ساخت پیشنهاد سئو با خطا مواجه شد.", "error");
    } finally {
      setGeneratingFor(null);
    }
  }

  async function handleGenerateForSelected() {
    if (!selectedProductId) return;
    setGenerating(true);
    await generateFor(selectedProductId);
    setGenerating(false);
  }

  const bySeverity = { HIGH: 0, MEDIUM: 0, LOW: 0 };
  problems?.forEach((p) => bySeverity[p.severity]++);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">سئو خودکار (SEO Autopilot)</h1>

      <AdminHelp storageKey="seo-autopilot">
        <p>این صفحه محصولات، دسته‌بندی‌ها و مقالات واقعی سایت را بر اساس قوانین مشخص (عنوان سئو، توضیح متا، طول محتوا، متن جایگزین تصویر، لینک‌های داخلی خراب و...) بررسی می‌کند — هیچ‌چیزی حدس زده نمی‌شود.</p>
        <p>برای هر محصول می‌توانید «پیشنهاد سئو» بسازید تا هوش مصنوعی عنوان، توضیح متا، کلمات کلیدی و متن جایگزین تصویر پیشنهاد دهد. هیچ پیشنهادی مستقیم روی محصول اعمال نمی‌شود مگر اینکه شما آن را بررسی و تأیید کنید.</p>
      </AdminHelp>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-red-500/40 bg-red-500/5 p-4">
          <p className="text-sm text-red-500/80">مشکلات با اولویت بالا</p>
          <p className="mt-1 text-xl font-extrabold text-red-500">{bySeverity.HIGH}</p>
        </div>
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
          <p className="text-sm text-amber-500/80">مشکلات با اولویت متوسط</p>
          <p className="mt-1 text-xl font-extrabold text-amber-500">{bySeverity.MEDIUM}</p>
        </div>
        <div className="rounded-lg border border-border-color bg-surface p-4">
          <p className="text-sm text-foreground/50">مشکلات با اولویت پایین</p>
          <p className="mt-1 text-xl font-extrabold">{bySeverity.LOW}</p>
        </div>
      </div>

      <div className="mb-8 rounded-lg border border-border-color p-4">
        <h2 className="mb-3 font-bold">ساخت پیشنهاد سئو برای یک محصول</h2>
        <div className="flex flex-wrap gap-2">
          <select
            value={selectedProductId}
            onChange={(e) => setSelectedProductId(e.target.value)}
            className="min-w-[240px] rounded-lg border border-border-color bg-background px-3 py-2 text-sm"
          >
            <option value="">— انتخاب محصول —</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button
            onClick={handleGenerateForSelected}
            disabled={!selectedProductId || generating}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-[#0b0e14] disabled:opacity-50"
          >
            {generating ? "در حال ساخت..." : "ساخت پیشنهاد سئو"}
          </button>
        </div>
      </div>

      {pendingSuggestions && pendingSuggestions.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 font-bold">پیشنهادهای سئو در انتظار تأیید</h2>
          <div className="space-y-1.5">
            {pendingSuggestions.map((s) => (
              <Link key={s.id} href={`/admin/seo/${s.id}`} className="block rounded-lg border border-border-color p-2 text-sm hover:border-brand">
                {s.productName}
              </Link>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 font-bold">مشکلات سئو شناسایی‌شده</h2>
        {problems === null ? (
          <p className="text-sm text-foreground/50">در حال بارگذاری...</p>
        ) : problems.length === 0 ? (
          <p className="text-sm text-foreground/50">مشکلی یافت نشد.</p>
        ) : (
          <div className="space-y-2">
            {problems.map((p, i) => (
              <div key={i} className={`flex items-center justify-between rounded-lg border p-3 text-sm ${SEVERITY_STYLE[p.severity]}`}>
                <div>
                  <p>
                    <span className="rounded bg-black/10 px-1.5 py-0.5 text-xs">{SEVERITY_LABEL[p.severity]}</span>{" "}
                    <span className="font-bold">{ENTITY_LABEL[p.entityType]}: {p.entityName}</span>
                  </p>
                  <p className="mt-1 text-xs opacity-80">
                    {p.field} — {p.message}
                  </p>
                </div>
                {p.entityType === "Product" && (
                  <button
                    onClick={() => generateFor(p.entityId)}
                    disabled={generatingFor === p.entityId}
                    className="shrink-0 rounded-lg border border-current px-3 py-1 text-xs disabled:opacity-50"
                  >
                    {generatingFor === p.entityId ? "در حال ساخت..." : "ساخت پیشنهاد سئو"}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
