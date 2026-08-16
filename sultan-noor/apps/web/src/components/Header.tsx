"use client";

import Link from "next/link";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import { useWishlist } from "@/context/WishlistContext";
import { useCompare } from "@/context/CompareContext";
import SearchBar from "./SearchBar";
import MegaMenu from "./MegaMenu";
import NotificationBell from "./NotificationBell";
import MobileDrawer from "./MobileDrawer";

const NAV_LINKS = [
  { href: "/", label: "خانه" },
  { href: "/blog", label: "وبلاگ" },
  { href: "/about", label: "درباره ما" },
  { href: "/contact", label: "تماس با ما" },
];

function IconLink({ href, label, count, children }: { href: string; label: string; count?: number; children: React.ReactNode }) {
  return (
    <Link href={href} className="relative flex h-9 w-9 items-center justify-center rounded-full text-foreground/70 transition-colors hover:bg-surface-2 hover:text-brand" aria-label={label}>
      {children}
      <AnimatePresence>
        {!!count && count > 0 && (
          <motion.span
            key={count}
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.4, opacity: 0 }}
            transition={{ type: "spring", stiffness: 500, damping: 20 }}
            className="absolute -top-0.5 -left-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-brand text-[10px] font-bold text-[#0b0e14]"
          >
            {count > 9 ? "9+" : count}
          </motion.span>
        )}
      </AnimatePresence>
    </Link>
  );
}

export default function Header() {
  const { user } = useAuth();
  const { cart } = useCart();
  const { itemIds } = useWishlist();
  const { ids: compareIds } = useCompare();
  const [megaOpen, setMegaOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  const itemCount = cart?.items?.reduce((sum, i) => sum + i.quantity, 0) ?? 0;
  const isStaff = user && ["SUPER_ADMIN", "ADMIN", "STAFF", "WAREHOUSE_MANAGER"].includes(user.role);

  return (
    <>
    <motion.header
      initial={{ y: -12, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="sticky top-0 z-30 border-b border-border-color bg-surface/85 backdrop-blur-md"
    >
      {/* row 1: brand, search, icon cluster */}
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
        <button
          onClick={() => setDrawerOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-foreground/70 md:hidden"
          aria-label="باز کردن منو"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
          </svg>
        </button>

        <Link href="/" className="flex flex-shrink-0 items-center gap-2">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" className="text-brand">
            <path
              d="M12 2 4 6v6c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6l-8-4Z"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinejoin="round"
            />
            <path d="M12 8a3 3 0 0 0-1.7 5.5c.2.2.4.4.4.7v.3h2.6v-.3c0-.3.2-.5.4-.7A3 3 0 0 0 12 8Z" fill="currentColor" />
          </svg>
          <span className="leading-tight">
            <span className="block text-lg font-extrabold">
              <span className="gradient-text">سلطان</span> نور
            </span>
            <span className="hidden text-[11px] text-muted sm:block">تجهیزات برق و روشنایی</span>
          </span>
        </Link>

        <div className="hidden flex-1 justify-center md:flex">
          <SearchBar />
        </div>

        <div className="mr-auto flex items-center gap-1">
          <button
            onClick={() => setMobileSearchOpen((v) => !v)}
            className="flex h-9 w-9 items-center justify-center rounded-full text-foreground/70 transition-colors hover:bg-surface-2 hover:text-brand md:hidden"
            aria-label="جستجو"
            aria-expanded={mobileSearchOpen}
          >
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" strokeLinecap="round" />
            </svg>
          </button>
          <IconLink href="/wishlist" label="علاقه‌مندی‌ها" count={itemIds.size}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M12 20.5s-7.5-4.6-9.9-9.2C.5 7.9 2 4.5 5.4 3.7c2-.5 3.9.3 5 1.9a.7.7 0 0 0 1.2 0c1.1-1.6 3-2.4 5-1.9 3.4.8 4.9 4.2 3.3 7.6-2.4 4.6-9.9 9.2-9.9 9.2Z" />
            </svg>
          </IconLink>
          <IconLink href="/compare" label="مقایسه محصولات" count={compareIds.length}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M8 3v18M16 3v18M4 8h4M16 8h4M4 16h4M16 16h4" strokeLinecap="round" />
            </svg>
          </IconLink>
          <IconLink href="/cart" label="سبد خرید" count={itemCount}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M3 6h2l2.4 11.4a2 2 0 0 0 2 1.6h7.2a2 2 0 0 0 2-1.6L20 8H6" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="10" cy="21" r="1" fill="currentColor" />
              <circle cx="17" cy="21" r="1" fill="currentColor" />
            </svg>
          </IconLink>
          <NotificationBell />
          <IconLink href={user ? "/orders" : "/login"} label="حساب کاربری">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="12" cy="8" r="3.4" />
              <path d="M5 20c1.2-3.5 4-5.4 7-5.4s5.8 1.9 7 5.4" strokeLinecap="round" />
            </svg>
          </IconLink>
        </div>
      </div>

      {/* mobile search: collapsed by default, toggled via the search icon */}
      <AnimatePresence initial={false}>
        {mobileSearchOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden md:hidden"
          >
            <div className="px-4 pb-3">
              <SearchBar />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* row 2: nav bar with mega menu */}
      <div className="hidden border-t border-border-color/70 md:block">
        <nav className="relative mx-auto flex max-w-6xl items-center gap-6 px-4 text-sm">
          <div
            className="relative py-3"
            onMouseEnter={() => setMegaOpen(true)}
            onMouseLeave={() => setMegaOpen(false)}
          >
            <Link href="/products" className="group relative flex items-center gap-1 py-1 font-medium transition-colors hover:text-brand">
              محصولات
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="absolute inset-x-0 -bottom-0.5 h-[1.5px] origin-right scale-x-0 bg-brand transition-transform duration-300 ease-out group-hover:scale-x-100" />
            </Link>
            <MegaMenu open={megaOpen} onNavigate={() => setMegaOpen(false)} />
          </div>

          {NAV_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="group relative py-3 font-medium transition-colors hover:text-brand">
              <span className="relative py-1">
                {l.label}
                <span className="absolute inset-x-0 -bottom-0.5 h-[1.5px] origin-right scale-x-0 bg-brand transition-transform duration-300 ease-out group-hover:scale-x-100" />
              </span>
            </Link>
          ))}

          {isStaff && (
            <Link href="/admin" className="group relative py-3 font-medium text-brand/90 transition-colors hover:text-brand">
              پنل مدیریت
            </Link>
          )}
        </nav>
      </div>
    </motion.header>
    {/* Rendered outside <header>: backdrop-blur-md on the sticky header creates a
        new containing block for position:fixed descendants (per the CSS spec for
        backdrop-filter), which would confine this overlay to the header's own box
        instead of the full viewport. */}
    <AnimatePresence>
      {megaOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          aria-hidden
          onClick={() => setMegaOpen(false)}
          className="fixed inset-0 z-20 hidden bg-black/50 backdrop-blur-sm md:block"
        />
      )}
    </AnimatePresence>
    <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  );
}
