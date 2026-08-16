"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { fadeUp } from "@/lib/motion";

const FEATURES = ["قیمت پلکانی", "سفارش عمده", "فاکتور رسمی", "حساب تجاری"];

export default function B2BSection() {
  return (
    <motion.div
      variants={fadeUp}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-40px" }}
      className="relative overflow-hidden rounded-[2rem] border border-border-color bg-gradient-to-br from-surface via-surface to-[#140f05] p-8 sm:p-12"
    >
      <div aria-hidden className="pointer-events-none absolute -bottom-16 -left-16 h-64 w-64 rounded-full bg-brand/15 blur-3xl" />
      <div className="relative grid gap-8 md:grid-cols-[1.3fr_1fr] md:items-center">
        <div>
          <span className="inline-block rounded-full bg-brand/10 px-4 py-1.5 text-xs font-bold text-brand">B2B</span>
          <h2 className="mt-4 text-2xl font-extrabold sm:text-3xl">
            خرید عمده و <span className="gradient-text">همکاری</span>
          </h2>
          <p className="mt-3 max-w-lg text-muted">
            قیمت‌های ویژه برای فروشگاه‌ها، پیمانکاران و برق‌کاران — با ثبت‌نام به‌عنوان مشتری عمده در سلطان نور.
          </p>
          <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {FEATURES.map((f) => (
              <li key={f} className="flex items-center gap-2 rounded-lg border border-border-color bg-surface-2 px-3 py-2 text-xs font-medium">
                <span className="h-1.5 w-1.5 rounded-full bg-brand" />
                {f}
              </li>
            ))}
          </ul>
        </div>
        <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.98 }} className="justify-self-start md:justify-self-end">
          <Link
            href="/login"
            className="inline-block rounded-xl bg-brand px-8 py-4 text-base font-bold text-[#0b0e14] shadow-lg shadow-brand/20 transition-shadow hover:shadow-xl"
          >
            شروع همکاری
          </Link>
        </motion.div>
      </div>
    </motion.div>
  );
}
