import type { Metadata } from "next";
import { apiFetch } from "@/lib/api";
import { Product } from "@/lib/types";
import ProductGrid from "@/components/ProductGrid";

async function safeGet<T>(path: string, fallback: T): Promise<T> {
  try {
    return await apiFetch<T>(path);
  } catch {
    return fallback;
  }
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}): Promise<Metadata> {
  const { q } = await searchParams;
  if (q) {
    return { title: `نتایج جستجو: ${q} | سلطان نور` };
  }
  return {
    title: "محصولات | سلطان نور",
    description: "خرید انواع تجهیزات برق و روشنایی با قیمت مناسب و ارسال سریع از فروشگاه سلطان نور.",
  };
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; brand?: string }>;
}) {
  const params = await searchParams;

  let products: Product[] = [];
  let note: string | null = null;

  if (params.q) {
    const searchRes = await safeGet<{ hits: { id: string }[] }>(`/search/products?q=${encodeURIComponent(params.q)}`, {
      hits: [],
    });
    if (searchRes.hits.length === 0) {
      note = `نتیجه‌ای برای «${params.q}» یافت نشد.`;
    } else {
      const detailed = await Promise.all(
        searchRes.hits.map((h) => safeGet<Product | null>(`/products/${h.id}`, null)),
      );
      products = detailed.filter((p): p is Product => Boolean(p));
    }
  } else {
    const qs = new URLSearchParams();
    if (params.category) qs.set("categoryId", params.category);
    if (params.brand) qs.set("brandId", params.brand);
    const res = await safeGet<{ items: Product[] }>(`/products?${qs.toString()}`, { items: [] });
    products = res.items;
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold">{params.q ? `نتایج جستجو: ${params.q}` : "همه محصولات"}</h1>
      {note && <p className="text-foreground/60">{note}</p>}
      <ProductGrid products={products} />
    </div>
  );
}
