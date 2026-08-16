"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { easeOut } from "@/lib/motion";
import HeroIllustration from "./HeroIllustration";

export default function HomeHero({ title }: { title?: string }) {
  return (
    <section className="relative isolate overflow-hidden rounded-[2rem] bg-gradient-to-br from-brand via-brand to-brand-dark text-white">
      {/* decorative diagonal accent + dot pattern for visual texture */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.15]"
        style={{
          backgroundImage: "radial-gradient(circle, #ffffff 1.5px, transparent 1.5px)",
          backgroundSize: "22px 22px",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 top-0 h-full w-1/2 rotate-6 bg-white/5"
      />

      <motion.div
        aria-hidden
        className="pointer-events-none absolute -top-16 -left-16 h-64 w-64 rounded-full bg-white/15 blur-3xl"
        animate={{ y: [0, 16, 0], opacity: [0.5, 0.8, 0.5] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
      />

      <div className="relative grid gap-6 p-8 sm:p-12 md:grid-cols-2 md:items-center md:gap-4">
        <motion.div
          initial="hidden"
          animate="show"
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.12, delayChildren: 0.1 } } }}
          className="relative z-10 order-2 md:order-1"
        >
          <motion.span
            variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: easeOut } } }}
            className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-4 py-1.5 text-xs font-medium backdrop-blur"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-white" />
            فروشگاه آنلاین سلطان نور
          </motion.span>

          <motion.h1
            variants={{ hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0, transition: { duration: 0.65, ease: easeOut } } }}
            className="max-w-lg text-4xl font-extrabold leading-[1.15] sm:text-5xl"
          >
            {title ?? "روشنایی که سلیقه شما را می‌فهمد"}
          </motion.h1>

          <motion.p
            variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: easeOut } } }}
            className="mt-5 max-w-md text-lg text-white/85"
          >
            محصولات روشنایی با بهترین کیفیت — برای مصرف‌کنندگان، و قیمت‌گذاری پلکانی ویژه عمده‌فروشان.
          </motion.p>

          <motion.div
            variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: easeOut } } }}
            className="mt-8 flex flex-wrap items-center gap-3"
          >
            <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
              <Link
                href="/products"
                className="inline-block rounded-xl bg-white px-6 py-3 font-bold text-brand-dark shadow-lg shadow-black/10 transition-shadow hover:shadow-xl"
              >
                مشاهده محصولات
              </Link>
            </motion.div>
            <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
              <Link
                href="/login"
                className="inline-block rounded-xl border border-white/40 px-6 py-3 font-bold text-white backdrop-blur transition hover:bg-white/10"
              >
                عضویت رایگان
              </Link>
            </motion.div>
          </motion.div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, ease: easeOut, delay: 0.15 }}
          className="relative z-10 order-1 flex items-center justify-center md:order-2"
        >
          <HeroIllustration />
        </motion.div>
      </div>
    </section>
  );
}
