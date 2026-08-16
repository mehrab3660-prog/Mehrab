"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { fadeUp } from "@/lib/motion";

export default function FinalCta() {
  return (
    <motion.div
      variants={fadeUp}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-40px" }}
      className="relative overflow-hidden rounded-[2rem] border border-border-color bg-gradient-to-l from-brand/10 via-surface to-surface p-8 text-center sm:p-12"
    >
      <h2 className="text-2xl font-extrabold sm:text-3xl">
        همین حالا <span className="gradient-text">روشنایی خانه‌تان</span> را ارتقا دهید
      </h2>
      <p className="mx-auto mt-3 max-w-lg text-muted">
        صدها محصول روشنایی و تجهیزات برق با قیمت مناسب و ارسال سریع — انتخاب کنید و سفارش دهید.
      </p>
      <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
        <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
          <Link
            href="/products"
            className="inline-block rounded-xl bg-brand px-7 py-3 font-bold text-[#0b0e14] shadow-lg shadow-brand/20 transition-shadow hover:shadow-xl"
          >
            مشاهده محصولات
          </Link>
        </motion.div>
        <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
          <Link
            href="/contact"
            className="inline-block rounded-xl border border-border-color px-7 py-3 font-bold text-foreground transition hover:border-brand hover:text-brand"
          >
            تماس با ما
          </Link>
        </motion.div>
      </div>
    </motion.div>
  );
}
