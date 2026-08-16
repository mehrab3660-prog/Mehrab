"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { easeOut } from "@/lib/motion";

export default function HomeHero({ title }: { title?: string }) {
  return (
    <section className="relative isolate overflow-hidden rounded-3xl bg-gradient-to-l from-brand to-brand-dark p-10 text-white sm:p-14">
      {/* Floating glow orbs — subtle motion reinforcing the "light" brand motif */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -top-16 -left-16 h-64 w-64 rounded-full bg-white/20 blur-3xl"
        animate={{ y: [0, 16, 0], opacity: [0.5, 0.8, 0.5] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -bottom-24 right-0 h-72 w-72 rounded-full bg-brand-light/40 blur-3xl"
        animate={{ y: [0, -20, 0], opacity: [0.4, 0.7, 0.4] }}
        transition={{ duration: 7, repeat: Infinity, ease: "easeInOut", delay: 1 }}
      />

      <motion.div
        initial="hidden"
        animate="show"
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.12, delayChildren: 0.1 } } }}
        className="relative"
      >
        <motion.span
          variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: easeOut } } }}
          className="mb-3 inline-block rounded-full bg-white/15 px-4 py-1 text-xs font-medium backdrop-blur"
        >
          فروشگاه آنلاین سلطان نور
        </motion.span>

        <motion.h1
          variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: easeOut } } }}
          className="max-w-2xl text-3xl font-extrabold leading-tight sm:text-4xl"
        >
          {title ?? "به فروشگاه سلطان نور خوش آمدید"}
        </motion.h1>

        <motion.p
          variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: easeOut } } }}
          className="mt-4 max-w-xl text-white/90"
        >
          خرید محصولات روشنایی با بهترین کیفیت — برای مصرف‌کنندگان و همچنین قیمت‌گذاری ویژه عمده‌فروشان.
        </motion.p>

        <motion.div
          variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: easeOut } } }}
          className="mt-8"
        >
          <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }} className="inline-block">
            <Link
              href="/products"
              className="inline-block rounded-xl bg-white px-6 py-3 font-bold text-brand-dark shadow-lg shadow-black/10 transition-shadow hover:shadow-xl"
            >
              مشاهده محصولات
            </Link>
          </motion.div>
        </motion.div>
      </motion.div>
    </section>
  );
}
