"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { staggerContainer, fadeUp } from "@/lib/motion";
import { Category } from "@/lib/types";

// Deterministic icon rotation so each category card gets a distinct glyph
// without needing per-category icon data from the backend.
const ICON_PATHS = [
  "M12 3a6 6 0 0 0-3.5 10.9c.4.3.7.8.7 1.3v.3h5.6v-.3c0-.5.3-1 .7-1.3A6 6 0 0 0 12 3ZM9 18h6M10 21h4",
  "M4 4h16v4H4V4Zm2 6h12v10H6V10Zm3 3v4m6-4v4",
  "M3 12h4l3-8 4 16 3-8h4",
  "M6 3h12l-1 6H7L6 3Zm1 6 1 12h8l1-12",
];

export default function CategoryShowcase({ categories }: { categories: Category[] }) {
  if (categories.length === 0) return null;

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-40px" }}
      className="grid grid-cols-2 gap-4 sm:grid-cols-4"
    >
      {categories.map((cat, i) => (
        <motion.div key={cat.id} variants={fadeUp} whileHover={{ y: -4 }} className="group relative">
          <div className="absolute -inset-px rounded-2xl bg-gradient-to-br from-brand-light to-brand opacity-0 blur-[2px] transition-opacity duration-300 group-hover:opacity-40" />
          <Link
            href={`/products?category=${cat.id}`}
            className="relative flex flex-col items-center gap-3 rounded-2xl surface-card p-6 text-center transition-shadow duration-300 group-hover:glow-shadow"
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand/10 text-brand transition-transform duration-300 group-hover:scale-110">
              <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d={ICON_PATHS[i % ICON_PATHS.length]} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <span className="text-sm font-bold">{cat.name}</span>
            {typeof cat._count?.products === "number" && (
              <span className="text-xs text-muted">{cat._count.products.toLocaleString("fa-IR")} محصول</span>
            )}
          </Link>
        </motion.div>
      ))}
    </motion.div>
  );
}
