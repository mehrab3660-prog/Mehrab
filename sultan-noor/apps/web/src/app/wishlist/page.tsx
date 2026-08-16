"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import ProductGrid from "@/components/ProductGrid";
import { Product } from "@/lib/types";

interface WishlistItem {
  id: string;
  product: Product;
}

export default function WishlistPage() {
  const { user, accessToken } = useAuth();
  const [items, setItems] = useState<WishlistItem[]>([]);

  useEffect(() => {
    if (!accessToken) return;
    api.get<{ items: WishlistItem[] }>("/wishlist", accessToken).then((res) => setItems(res.items));
  }, [accessToken]);

  if (!user) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p>برای مشاهده علاقه‌مندی‌ها ابتدا وارد شوید.</p>
        <Link href="/login" className="mt-4 inline-block rounded-lg bg-brand px-5 py-2 text-[#0b0e14]">
          ورود / ثبت‌نام
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold">علاقه‌مندی‌های من</h1>
      {items.length === 0 ? (
        <p className="text-foreground/60">فهرست علاقه‌مندی‌های شما خالی است.</p>
      ) : (
        <ProductGrid products={items.map((item) => item.product)} />
      )}
    </div>
  );
}
