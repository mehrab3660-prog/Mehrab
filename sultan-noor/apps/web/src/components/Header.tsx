"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="group relative py-1 transition-colors hover:text-brand">
      {children}
      <span className="absolute inset-x-0 -bottom-0.5 h-[1.5px] origin-right scale-x-0 bg-brand transition-transform duration-300 ease-out group-hover:scale-x-100" />
    </Link>
  );
}

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
    <motion.header
      initial={{ y: -12, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="sticky top-0 z-30 border-b border-border-color bg-surface/80 backdrop-blur-md"
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
        <Link href="/" className="text-xl font-extrabold tracking-tight">
          <span className="gradient-text">سلطان</span> <span>نور</span>
        </Link>

        <form onSubmit={handleSearch} className="order-3 flex w-full flex-1 items-center gap-2 sm:order-2 sm:w-auto">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="جستجوی محصولات..."
            className="w-full rounded-lg border border-border-color bg-background px-3 py-2 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
          <motion.button
            whileTap={{ scale: 0.95 }}
            type="submit"
            className="rounded-lg bg-brand px-3 py-2 text-sm text-white transition-colors hover:bg-brand-dark"
          >
            جستجو
          </motion.button>
        </form>

        <nav className="order-2 flex items-center gap-4 text-sm sm:order-3">
          <NavLink href="/products">محصولات</NavLink>
          <NavLink href="/blog">وبلاگ</NavLink>
          <NavLink href="/wishlist">علاقه‌مندی‌ها</NavLink>
          <Link href="/cart" className="group relative py-1 transition-colors hover:text-brand">
            سبد خرید
            <span className="absolute inset-x-0 -bottom-0.5 h-[1.5px] origin-right scale-x-0 bg-brand transition-transform duration-300 ease-out group-hover:scale-x-100" />
            <AnimatePresence>
              {itemCount > 0 && (
                <motion.span
                  key={itemCount}
                  initial={{ scale: 0.4, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.4, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 500, damping: 20 }}
                  className="absolute -top-2 -left-3 rounded-full bg-brand px-1.5 text-xs text-white"
                >
                  {itemCount}
                </motion.span>
              )}
            </AnimatePresence>
          </Link>
          {isStaff && <NavLink href="/admin">پنل مدیریت</NavLink>}
          {user ? (
            <div className="flex items-center gap-2">
              <NavLink href="/orders">سفارش‌های من</NavLink>
              <button onClick={logout} className="text-foreground/55 transition-colors hover:text-brand">
                خروج
              </button>
            </div>
          ) : (
            <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
              <Link
                href="/login"
                className="rounded-lg bg-brand px-3 py-1.5 text-white shadow-sm shadow-brand/30 transition-colors hover:bg-brand-dark"
              >
                ورود / ثبت‌نام
              </Link>
            </motion.div>
          )}
        </nav>
      </div>
    </motion.header>
  );
}
