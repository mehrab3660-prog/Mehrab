"use client";

import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { useCategoryTree } from "@/lib/useCategories";
import { useAuth } from "@/context/AuthContext";

const LINKS = [
  { href: "/", label: "خانه" },
  { href: "/products", label: "محصولات" },
  { href: "/blog", label: "وبلاگ" },
  { href: "/about", label: "درباره ما" },
  { href: "/contact", label: "تماس با ما" },
];

export default function MobileDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const categories = useCategoryTree();
  const { user, logout } = useAuth();

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
            className="fixed inset-y-0 right-0 z-50 w-80 max-w-[85vw] overflow-y-auto border-l border-border-color bg-surface p-5 md:hidden"
          >
            <div className="mb-6 flex items-center justify-between">
              <span className="text-lg font-extrabold">
                <span className="gradient-text">سلطان</span> نور
              </span>
              <button onClick={onClose} className="text-foreground/60" aria-label="بستن منو">
                ✕
              </button>
            </div>

            <nav className="space-y-1">
              {LINKS.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={onClose}
                  className="block rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-surface-2 hover:text-brand"
                >
                  {l.label}
                </Link>
              ))}
            </nav>

            {categories.length > 0 && (
              <div className="mt-6 border-t border-border-color pt-4">
                <p className="mb-2 px-3 text-xs font-bold text-muted">دسته‌بندی‌ها</p>
                {categories.map((cat) => (
                  <Link
                    key={cat.id}
                    href={`/products?category=${cat.id}`}
                    onClick={onClose}
                    className="block rounded-lg px-3 py-2 text-sm text-foreground/80 transition-colors hover:bg-surface-2 hover:text-brand"
                  >
                    {cat.name}
                  </Link>
                ))}
              </div>
            )}

            <div className="mt-6 border-t border-border-color pt-4">
              {user ? (
                <button
                  onClick={() => {
                    logout();
                    onClose();
                  }}
                  className="w-full rounded-lg border border-border-color px-3 py-2.5 text-sm transition-colors hover:border-brand hover:text-brand"
                >
                  خروج از حساب
                </button>
              ) : (
                <Link
                  href="/login"
                  onClick={onClose}
                  className="block w-full rounded-lg bg-brand px-3 py-2.5 text-center text-sm font-bold text-[#0b0e14]"
                >
                  ورود / ثبت‌نام
                </Link>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
