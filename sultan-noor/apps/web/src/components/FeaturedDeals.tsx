"use client";

import Link from "next/link";
import { Product } from "@/lib/types";
import ProductGrid from "./ProductGrid";
import Countdown from "./Countdown";

function endOfToday() {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

export default function FeaturedDeals({ products }: { products: Product[] }) {
  if (products.length === 0) return null;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold">
            پیشنهاد <span className="gradient-text">شگفت‌انگیز</span> سلطان
          </h2>
          <Countdown target={endOfToday()} />
        </div>
        <Link href="/products" className="text-sm font-medium text-brand transition hover:text-brand-dark">
          مشاهده همه ←
        </Link>
      </div>
      <ProductGrid products={products} />
    </div>
  );
}
