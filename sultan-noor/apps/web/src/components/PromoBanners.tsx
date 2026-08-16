"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { staggerContainer, fadeUp } from "@/lib/motion";

export default function PromoBanners() {
  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-40px" }}
      className="grid gap-4 sm:grid-cols-2"
    >
      <motion.div variants={fadeUp} whileHover={{ y: -4 }}>
        <Link
          href="/products"
          className="relative flex h-40 flex-col justify-center overflow-hidden rounded-2xl border border-border-color bg-gradient-to-br from-accent-purple/25 via-surface to-surface p-6"
        >
          <div aria-hidden className="pointer-events-none absolute -left-10 -top-10 h-40 w-40 rounded-full bg-accent-purple/25 blur-3xl" />
          <span className="relative text-lg font-extrabold">تخفیف‌های ویژه</span>
          <span className="relative mt-1 text-sm text-muted">روی محصولات منتخب فروشگاه</span>
          <span className="relative mt-4 text-sm font-bold text-brand">مشاهده محصولات ←</span>
        </Link>
      </motion.div>

      <motion.div variants={fadeUp} whileHover={{ y: -4 }}>
        <Link
          href="/login"
          className="relative flex h-40 flex-col justify-center overflow-hidden rounded-2xl border border-border-color bg-gradient-to-br from-brand/20 via-surface to-surface p-6"
        >
          <div aria-hidden className="pointer-events-none absolute -left-10 -top-10 h-40 w-40 rounded-full bg-brand/25 blur-3xl" />
          <span className="relative text-lg font-extrabold">سفارش عمده</span>
          <span className="relative mt-1 text-sm text-muted">قیمت همکاری ویژه فروشگاه‌ها و پیمانکاران</span>
          <span className="relative mt-4 text-sm font-bold text-brand">درخواست همکاری ←</span>
        </Link>
      </motion.div>
    </motion.div>
  );
}
