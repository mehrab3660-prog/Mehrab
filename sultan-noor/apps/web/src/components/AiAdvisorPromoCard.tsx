"use client";

import { motion } from "framer-motion";
import { fadeUp } from "@/lib/motion";
import { useAiAdvisor } from "@/context/AiAdvisorContext";

export default function AiAdvisorPromoCard() {
  const { setOpen } = useAiAdvisor();

  return (
    <motion.div
      variants={fadeUp}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-40px" }}
      className="relative overflow-hidden rounded-[2rem] border border-border-color bg-gradient-to-br from-accent-purple/20 via-surface to-accent-cyan/10 p-8 sm:p-10"
    >
      <div aria-hidden className="pointer-events-none absolute -top-10 right-10 h-56 w-56 rounded-full bg-accent-purple/10 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-10 left-10 h-56 w-56 rounded-full bg-accent-cyan/[0.08] blur-3xl" />

      <div className="relative flex flex-col items-center gap-4 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-accent-purple to-accent-cyan text-3xl shadow-lg">
          🤖
        </span>
        <h2 className="text-xl font-extrabold sm:text-2xl">مشاور هوشمند سلطان</h2>
        <p className="max-w-md text-sm text-muted">
          هر سوالی درباره‌ی انتخاب تجهیزات برق و روشنایی داری، از من بپرس!
        </p>
        <motion.button
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.96 }}
          onClick={() => setOpen(true)}
          className="rounded-xl bg-gradient-to-l from-accent-purple to-accent-cyan px-7 py-3 text-sm font-bold text-white shadow-lg"
        >
          شروع گفتگو
        </motion.button>
      </div>
    </motion.div>
  );
}
