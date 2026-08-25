"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { easeOut } from "@/lib/motion";

const STORAGE_KEY = "sultan-noor-splash-seen";

// A once-ever brand intro shown before the storefront on a visitor's first
// visit, then never again on that browser. Rendered client-side only so it
// never blocks SSR content or crawlers from reaching the real page
// underneath.
export default function SplashIntro() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY)) return;
    setVisible(true);
  }, []);

  useEffect(() => {
    if (!visible) return;
    document.body.style.overflow = "hidden";
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") dismiss();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [visible]);

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, "1");
    setVisible(false);
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label="خوش‌آمدگویی سلطان نور"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.5, ease: easeOut } }}
          className="fixed inset-0 z-[200] flex items-center justify-center overflow-hidden bg-background"
        >
          <div
            aria-hidden
            className="absolute inset-0 bg-cover bg-center opacity-25 blur-sm"
            style={{ backgroundImage: "url('/images/showroom/hero-house.jpg')" }}
          />
          <div
            aria-hidden
            className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-gradient-to-r from-transparent via-brand/70 to-transparent shadow-[0_0_20px_rgba(247,191,89,0.5)]"
          />
          <div aria-hidden className="absolute top-0 left-1/2 h-64 w-3/4 -translate-x-1/2 rounded-full bg-brand/5 blur-[100px]" />

          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.7, ease: easeOut }}
            className="relative z-10 mx-4 flex w-full max-w-lg flex-col items-center gap-6 border border-white/10 bg-black/40 p-8 text-center shadow-2xl backdrop-blur-2xl sm:p-12"
          >
            <h1 className="text-4xl font-extrabold text-brand [text-shadow:0_0_24px_rgba(247,191,89,0.45)] sm:text-5xl">
              سلطان نور
            </h1>
            <div className="h-px w-full bg-gradient-to-r from-transparent via-white/15 to-transparent" />
            <p className="text-sm font-light text-foreground/80 sm:text-base">تجهیزات برق و روشنایی</p>

            <button
              type="button"
              onClick={dismiss}
              autoFocus
              data-testid="splash-enter-button"
              className="group mt-2 inline-flex items-center gap-2 bg-brand px-8 py-3 text-sm font-extrabold text-[#0b0e14] transition-transform hover:scale-[1.02] active:scale-95"
            >
              ورود به فروشگاه
              <span aria-hidden className="transition-transform group-hover:-translate-x-1">
                ←
              </span>
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
