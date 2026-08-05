"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";

export default function Header() {
  const { user, logout } = useAuth();
  const { cart } = useCart();
  const router = useRouter();
  const [query, setQuery] = useState("");

  const itemCount = cart?.items?.reduce((sum, i) => sum + i.quantity, 0) ?? 0;

  const isStaff = user && ["SUPER_ADMIN", "ADMIN", "STAFF", "WAREHOUSE_MANAGER"].includes(user.role);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    router.push(`/products?q=${encodeURIComponent(query)}`);
  }

  return (
    <header className="sticky top-0 z-30 border-b border-border-color bg-surface/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
        <Link href="/" className="text-xl font-extrabold text-brand">
          سلطان نور
        </Link>

        <form onSubmit={handleSearch} className="order-3 flex w-full flex-1 items-center gap-2 sm:order-2 sm:w-auto">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="جستجوی محصولات..."
            className="w-full rounded-lg border border-border-color bg-background px-3 py-2 text-sm"
          />
          <button type="submit" className="rounded-lg bg-brand px-3 py-2 text-sm text-white">
            جستجو
          </button>
        </form>

        <nav className="order-2 flex items-center gap-4 text-sm sm:order-3">
          <Link href="/products" className="hover:text-brand">
            محصولات
          </Link>
          <Link href="/blog" className="hover:text-brand">
            وبلاگ
          </Link>
          <Link href="/wishlist" className="hover:text-brand">
            علاقه‌مندی‌ها
          </Link>
          <Link href="/cart" className="relative hover:text-brand">
            سبد خرید
            {itemCount > 0 && (
              <span className="absolute -top-2 -left-3 rounded-full bg-brand px-1.5 text-xs text-white">
                {itemCount}
              </span>
            )}
          </Link>
          {isStaff && (
            <Link href="/admin" className="hover:text-brand">
              پنل مدیریت
            </Link>
          )}
          {user ? (
            <div className="flex items-center gap-2">
              <Link href="/orders" className="hover:text-brand">
                سفارش‌های من
              </Link>
              <button onClick={logout} className="text-foreground/60 hover:text-brand">
                خروج
              </button>
            </div>
          ) : (
            <Link href="/login" className="rounded-lg bg-brand px-3 py-1.5 text-white">
              ورود / ثبت‌نام
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
