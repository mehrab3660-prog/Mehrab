"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Product } from "@/lib/types";
import { useCompare } from "@/context/CompareContext";
import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import { useToast } from "@/context/ToastContext";

function formatToman(value: string | number) {
  return `${Number(value).toLocaleString("fa-IR")} تومان`;
}

export default function ComparePage() {
  const { ids, toggle, clear } = useCompare();
  const { user } = useAuth();
  const { addItem } = useCart();
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (ids.length === 0) {
      setProducts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all(ids.map((id) => api.get<Product>(`/products/${id}`).catch(() => null))).then((results) => {
      setProducts(results.filter((p): p is Product => p !== null));
      setLoading(false);
    });
  }, [ids]);

  async function handleAddToCart(product: Product) {
    if (!user) {
      toast("برای افزودن به سبد خرید ابتدا وارد شوید.", "info");
      return;
    }
    try {
      await addItem(product.id, 1, product.variants?.[0]?.id);
      toast("به سبد خرید اضافه شد.", "success");
    } catch {
      toast("افزودن به سبد خرید با خطا مواجه شد.", "error");
    }
  }

  const attributeKeys = Array.from(
    new Set(products.flatMap((p) => p.variants.flatMap((v) => Object.keys(v.attributes || {})))),
  );

  if (loading) {
    return <div className="mx-auto max-w-6xl px-4 py-16 text-center">در حال بارگذاری...</div>;
  }

  if (products.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p>هنوز محصولی برای مقایسه انتخاب نکرده‌اید.</p>
        <Link href="/products" className="mt-4 inline-block rounded-lg bg-brand px-5 py-2 text-[#0b0e14]">
          مشاهده محصولات
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">مقایسه محصولات</h1>
        <button onClick={clear} className="text-sm text-foreground/50 hover:text-red-400">
          پاک کردن همه
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[600px] border-collapse text-sm">
          <tbody>
            <tr>
              <td className="w-32 p-2 align-top text-xs text-foreground/40">محصول</td>
              {products.map((p) => (
                <td key={p.id} className="p-2 align-top">
                  <div className="relative rounded-xl border border-border-color p-3">
                    <button
                      onClick={() => toggle(p.id)}
                      aria-label="حذف از مقایسه"
                      className="absolute left-2 top-2 text-xs text-foreground/40 hover:text-red-400"
                    >
                      ✕
                    </button>
                    {p.images?.[0]?.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.images[0].url} alt={p.name} className="mb-2 h-28 w-full rounded-lg object-cover" />
                    ) : (
                      <div className="mb-2 h-28 w-full rounded-lg bg-surface-2" />
                    )}
                    <Link href={`/products/${p.slug}`} className="line-clamp-2 text-sm font-bold hover:text-brand">
                      {p.name}
                    </Link>
                  </div>
                </td>
              ))}
            </tr>
            <tr className="border-t border-border-color">
              <td className="p-2 text-xs text-foreground/40">قیمت</td>
              {products.map((p) => (
                <td key={p.id} className="p-2 font-bold text-brand">
                  {formatToman(p.basePrice)}
                </td>
              ))}
            </tr>
            <tr className="border-t border-border-color">
              <td className="p-2 text-xs text-foreground/40">برند</td>
              {products.map((p) => (
                <td key={p.id} className="p-2">
                  {p.brand?.name ?? "—"}
                </td>
              ))}
            </tr>
            <tr className="border-t border-border-color">
              <td className="p-2 text-xs text-foreground/40">دسته‌بندی</td>
              {products.map((p) => (
                <td key={p.id} className="p-2">
                  {p.category?.name ?? "—"}
                </td>
              ))}
            </tr>
            <tr className="border-t border-border-color">
              <td className="p-2 text-xs text-foreground/40">امتیاز</td>
              {products.map((p) => (
                <td key={p.id} className="p-2">
                  {p.avgRating ? `${p.avgRating.toFixed(1)} (${p.reviewCount ?? 0} نظر)` : "بدون امتیاز"}
                </td>
              ))}
            </tr>
            <tr className="border-t border-border-color">
              <td className="p-2 text-xs text-foreground/40">موجودی</td>
              {products.map((p) => (
                <td key={p.id} className="p-2">
                  {p.totalStock === undefined ? "—" : p.totalStock > 0 ? "موجود" : "ناموجود"}
                </td>
              ))}
            </tr>
            {attributeKeys.map((key) => (
              <tr key={key} className="border-t border-border-color">
                <td className="p-2 text-xs text-foreground/40">{key}</td>
                {products.map((p) => {
                  const values = Array.from(new Set(p.variants.map((v) => v.attributes[key]).filter(Boolean)));
                  return (
                    <td key={p.id} className="p-2">
                      {values.length > 0 ? values.join("، ") : "—"}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr className="border-t border-border-color">
              <td className="p-2" />
              {products.map((p) => (
                <td key={p.id} className="p-2">
                  <button
                    onClick={() => handleAddToCart(p)}
                    disabled={p.totalStock === 0}
                    className="w-full rounded-lg bg-brand px-3 py-2 text-xs font-bold text-[#0b0e14] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    افزودن به سبد
                  </button>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
