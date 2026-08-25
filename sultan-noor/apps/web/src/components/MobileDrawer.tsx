"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { useCategoryTree } from "@/lib/useCategories";
import { useAuth } from "@/context/AuthContext";

const LINKS = [
  {
    href: "/",
    label: "خانه",
    icon: <path d="M4 11.5 12 4l8 7.5M6 10v9a1 1 0 0 0 1 1h3v-6h4v6h3a1 1 0 0 0 1-1v-9" strokeLinecap="round" strokeLinejoin="round" />,
  },
  {
    href: "/products",
    label: "محصولات",
    icon: <path d="M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z" strokeLinejoin="round" />,
  },
  {
    href: "/blog",
    label: "وبلاگ",
    icon: <path d="M4 5h16v14H4V5Zm3 4h10M7 12h10M7 15h6" strokeLinecap="round" />,
  },
  {
    href: "/about",
    label: "درباره ما",
    icon: <><circle cx="12" cy="12" r="9" /><path d="M12 16v-4M12 8h.01" strokeLinecap="round" /></>,
  },
  {
    href: "/contact",
    label: "تماس با ما",
    icon: <path d="M4 6h16v12H4V6Zm0 0 8 7 8-7" strokeLinecap="round" strokeLinejoin="round" />,
  },
];

const STAFF_ROLES = ["SUPER_ADMIN", "ADMIN", "STAFF", "WAREHOUSE_MANAGER"];

export default function MobileDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const categories = useCategoryTree();
  const { user, logout } = useAuth();
  const [categoriesOpen, setCategoriesOpen] = useState(categories.length <= 3);
  const isStaff = user && STAFF_ROLES.includes(user.role);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
          />
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
            className="fixed inset-y-0 right-0 z-50 flex w-[86vw] max-w-sm flex-col overflow-y-auto border-l border-border-color bg-surface md:hidden"
          >
            <div className="flex items-center justify-between border-b border-border-color px-5 py-4">
              <span className="text-lg font-extrabold">
                <span className="gradient-text">سلطان</span> نور
              </span>
              <button
                onClick={onClose}
                className="flex h-10 w-10 items-center justify-center rounded-full text-foreground/60 transition-colors hover:bg-surface-2 hover:text-foreground"
                aria-label="بستن منو"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            {/* account status — always the first thing after the header, so login/account is unmistakable */}
            <div className="border-b border-border-color px-5 py-4">
              {user ? (
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <circle cx="12" cy="8" r="3.4" />
                      <path d="M5 20c1.2-3.5 4-5.4 7-5.4s5.8 1.9 7 5.4" strokeLinecap="round" />
                    </svg>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{user.phone}</p>
                    <Link href="/orders" onClick={onClose} className="text-xs font-medium text-brand">
                      مشاهده حساب و سفارش‌ها ←
                    </Link>
                  </div>
                </div>
              ) : null}
              {isStaff && (
                <Link
                  href="/admin"
                  onClick={onClose}
                  className="mt-3 flex items-center justify-center gap-2 rounded-xl border border-brand/40 bg-brand/10 py-2.5 text-sm font-bold text-brand"
                >
                  🤖 پنل مدیریت
                </Link>
              )}
              {!user && (
                <Link
                  href="/login"
                  onClick={onClose}
                  className="flex items-center justify-center gap-2 rounded-xl bg-brand py-3 text-sm font-bold text-[#0b0e14] shadow-lg shadow-brand/20"
                >
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <circle cx="12" cy="8" r="3.4" />
                    <path d="M5 20c1.2-3.5 4-5.4 7-5.4s5.8 1.9 7 5.4" strokeLinecap="round" />
                  </svg>
                  ورود / ثبت‌نام
                </Link>
              )}
            </div>

            <nav className="space-y-1 px-3 py-4">
              {LINKS.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={onClose}
                  className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors hover:bg-surface-2 hover:text-brand"
                >
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="flex-shrink-0 text-foreground/50">
                    {l.icon}
                  </svg>
                  {l.label}
                </Link>
              ))}
            </nav>

            {categories.length > 0 && (
              <div className="border-t border-border-color px-3 py-3">
                <button
                  onClick={() => setCategoriesOpen((v) => !v)}
                  aria-expanded={categoriesOpen}
                  className="flex w-full items-center justify-between rounded-xl px-3 py-3 text-sm font-bold transition-colors hover:bg-surface-2"
                >
                  <span className="flex items-center gap-3">
                    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="text-foreground/50">
                      <path d="M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z" strokeLinejoin="round" />
                    </svg>
                    دسته‌بندی محصولات
                  </span>
                  <motion.svg
                    animate={{ rotate: categoriesOpen ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="text-foreground/40"
                  >
                    <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                  </motion.svg>
                </button>
                <AnimatePresence initial={false}>
                  {categoriesOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="space-y-0.5 py-1">
                        {categories.map((cat) => (
                          <Link
                            key={cat.id}
                            href={`/products?category=${cat.id}`}
                            onClick={onClose}
                            className="block rounded-lg px-3 py-2.5 pr-11 text-sm text-foreground/75 transition-colors hover:bg-surface-2 hover:text-brand"
                          >
                            {cat.name}
                            {cat._count && <span className="mr-1.5 text-xs text-foreground/40">({cat._count.products.toLocaleString("fa-IR")})</span>}
                          </Link>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            <div className="mt-auto border-t border-border-color px-5 py-4">
              {user && (
                <button
                  onClick={() => {
                    logout();
                    onClose();
                  }}
                  className="w-full rounded-xl border border-border-color py-3 text-sm font-medium text-foreground/70 transition-colors hover:border-red-400/40 hover:text-red-400"
                >
                  خروج از حساب
                </button>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
