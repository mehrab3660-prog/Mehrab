"use client";

import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { useCategoryTree } from "@/lib/useCategories";

export default function MegaMenu({ open }: { open: boolean }) {
  const categories = useCategoryTree();

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.18 }}
          className="absolute inset-x-0 top-full z-40 border-b border-border-color bg-surface shadow-2xl shadow-black/40"
        >
          <div className="mx-auto grid max-w-6xl grid-cols-2 gap-8 px-4 py-8 sm:grid-cols-4">
            {categories.length === 0 ? (
              <p className="col-span-full text-center text-sm text-muted">
                هنوز دسته‌بندی‌ای ثبت نشده است.
              </p>
            ) : (
              categories.map((cat) => (
                <div key={cat.id}>
                  <Link href={`/products?category=${cat.id}`} className="font-bold transition-colors hover:text-brand">
                    {cat.name}
                  </Link>
                  {cat.children && cat.children.length > 0 && (
                    <ul className="mt-3 space-y-2 text-sm text-muted">
                      {cat.children.map((child) => (
                        <li key={child.id}>
                          <Link href={`/products?category=${child.id}`} className="transition-colors hover:text-brand">
                            {child.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
