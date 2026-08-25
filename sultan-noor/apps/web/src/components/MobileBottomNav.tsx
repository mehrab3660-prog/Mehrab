"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import { useBottomNavVisible } from "@/lib/useBottomNav";

const ICONS = {
  home: (
    <path d="M4 11.5 12 4l8 7.5M6 10v9a1 1 0 0 0 1 1h3v-6h4v6h3a1 1 0 0 0 1-1v-9" strokeLinecap="round" strokeLinejoin="round" />
  ),
  categories: <path d="M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z" strokeLinejoin="round" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" strokeLinecap="round" /></>,
  cart: (
    <>
      <path d="M3 6h2l2.4 11.4a2 2 0 0 0 2 1.6h7.2a2 2 0 0 0 2-1.6L20 8H6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="10" cy="21" r="1" fill="currentColor" />
      <circle cx="17" cy="21" r="1" fill="currentColor" />
    </>
  ),
  account: <><circle cx="12" cy="8" r="3.4" /><path d="M5 20c1.2-3.5 4-5.4 7-5.4s5.8 1.9 7 5.4" strokeLinecap="round" /></>,
};

export default function MobileBottomNav() {
  const pathname = usePathname();
  const { user } = useAuth();
  const { cart } = useCart();
  const visible = useBottomNavVisible();
  const itemCount = cart?.items?.reduce((sum, i) => sum + i.quantity, 0) ?? 0;

  if (!visible) return null;

  const items = [
    { href: "/", icon: "home", label: "خانه" },
    { href: "/products", icon: "categories", label: "دسته‌ها" },
    { href: "/products?focus=search", icon: "search", label: "جستجو" },
    { href: "/cart", icon: "cart", label: "سبد", count: itemCount },
    { href: user ? "/orders" : "/login", icon: "account", label: "حساب" },
  ] as const;

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border-color bg-surface/95 backdrop-blur-md sm:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="grid grid-cols-5">
        {items.map((item) => {
          const active = pathname === item.href.split("?")[0];
          return (
            <Link
              key={item.label}
              href={item.href}
              className={`relative flex flex-col items-center gap-1 py-2.5 text-[11px] transition-colors ${
                active ? "text-brand" : "text-foreground/55"
              }`}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                {ICONS[item.icon]}
              </svg>
              {item.label}
              {"count" in item && !!item.count && (
                <span className="absolute top-1 left-1/2 flex h-3.5 w-3.5 translate-x-3 items-center justify-center rounded-full bg-brand text-[9px] font-bold text-[#0b0e14]">
                  {item.count > 9 ? "9+" : item.count}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
