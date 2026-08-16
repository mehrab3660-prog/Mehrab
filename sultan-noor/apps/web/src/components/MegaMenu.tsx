"use client";

import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { useCategoryTree } from "@/lib/useCategories";
import { useAiAdvisor } from "@/context/AiAdvisorContext";

const CATEGORY_ICON = (
  <path d="M12 3a6 6 0 0 0-3.5 10.9c.4.3.7.8.7 1.3v.3h5.6v-.3c0-.5.3-1 .7-1.3A6 6 0 0 0 12 3Z" />
);

export default function MegaMenu({ open, onNavigate }: { open: boolean; onNavigate?: () => void }) {
  const categories = useCategoryTree();
  const { setOpen: openAiAdvisor } = useAiAdvisor();

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
          <div className="mx-auto flex max-w-6xl gap-8 px-4 py-8">
            <div className="flex-1">
              <p className="mb-4 text-xs font-bold tracking-wide text-muted">دسته‌بندی‌های اصلی فروشگاه</p>
              {categories.length === 0 ? (
                <p className="text-sm text-muted">هنوز دسته‌بندی‌ای ثبت نشده است.</p>
              ) : (
                <div className="flex flex-wrap gap-3">
                  {categories.map((cat) => (
                    <div
                      key={cat.id}
                      className="w-56 flex-shrink-0 rounded-xl border border-border-color p-4 transition-colors hover:border-brand/40"
                    >
                      <Link
                        href={`/products?category=${cat.id}`}
                        onClick={onNavigate}
                        className="flex items-center gap-2 font-bold transition-colors hover:text-brand"
                      >
                        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            {CATEGORY_ICON}
                          </svg>
                        </span>
                        <span className="flex-1">{cat.name}</span>
                        {cat._count && (
                          <span className="text-xs font-normal text-muted">({cat._count.products.toLocaleString("fa-IR")})</span>
                        )}
                      </Link>
                      {cat.children && cat.children.length > 0 && (
                        <ul className="mt-3 space-y-2 border-t border-border-color pt-3 text-sm text-muted">
                          {cat.children.map((child) => (
                            <li key={child.id}>
                              <Link href={`/products?category=${child.id}`} onClick={onNavigate} className="transition-colors hover:text-brand">
                                {child.name}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <Link
                href="/products"
                onClick={onNavigate}
                className="mt-6 inline-flex items-center gap-1 text-sm font-medium text-brand transition hover:text-brand-dark"
              >
                مشاهده همه محصولات ←
              </Link>
            </div>

            <div className="hidden w-64 flex-shrink-0 rounded-2xl border border-brand/20 bg-gradient-to-br from-brand/10 via-surface to-surface p-5 lg:block">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-accent-purple to-accent-cyan text-lg">
                🤖
              </span>
              <p className="mt-3 text-sm font-bold">مطمئن نیستید کدام محصول مناسب شماست؟</p>
              <p className="mt-1.5 text-xs leading-5 text-muted">
                کافیست نیازتان را بگویید؛ مشاور هوشمند سلطان نور بهترین گزینه را پیشنهاد می‌دهد.
              </p>
              <button
                onClick={() => {
                  openAiAdvisor(true);
                  onNavigate?.();
                }}
                className="mt-4 w-full rounded-lg bg-brand py-2 text-xs font-bold text-[#0b0e14] shadow shadow-brand/20"
              >
                شروع گفتگو با مشاور
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
