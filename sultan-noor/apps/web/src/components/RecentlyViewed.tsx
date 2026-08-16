"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Product } from "@/lib/types";
import { getRecentlyViewedIds } from "@/lib/recentlyViewed";
import ProductGrid from "./ProductGrid";

export default function RecentlyViewed({ excludeProductId }: { excludeProductId?: string }) {
  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    const ids = getRecentlyViewedIds().filter((id) => id !== excludeProductId);
    if (ids.length === 0) {
      setProducts([]);
      return;
    }
    Promise.all(ids.map((id) => api.get<Product>(`/products/${id}`).catch(() => null))).then((results) => {
      setProducts(results.filter((p): p is Product => p !== null));
    });
  }, [excludeProductId]);

  if (products.length === 0) return null;

  return (
    <section className="mt-8 sm:mt-14">
      <h2 className="mb-6 text-lg font-bold">
        بازدیدهای <span className="gradient-text">اخیر</span>
      </h2>
      <ProductGrid products={products} />
    </section>
  );
}
