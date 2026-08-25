"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { easeOut } from "@/lib/motion";
import { Banner } from "@/lib/types";
import HeroIllustration from "./HeroIllustration";
import { useAiAdvisor } from "@/context/AiAdvisorContext";

interface Slide {
  title: string;
  accentWord?: string;
  subtitle: string;
  ctaLabel: string;
  ctaHref: string;
  imageUrl?: string | null;
}

const DEFAULT_SLIDE: Slide = {
  title: "نورپردازی بهتر، زندگی",
  accentWord: "بهتر",
  subtitle: "تجربه‌ی خریدی هوشمند، سریع و مطمئن برای تجهیزات برق و روشنایی.",
  ctaLabel: "مشاهده محصولات",
  ctaHref: "/products",
};

function bannerToSlide(b: Banner): Slide {
  return {
    title: b.title,
    subtitle: "تجربه‌ی خریدی هوشمند، سریع و مطمئن برای تجهیزات برق و روشنایی.",
    ctaLabel: "مشاهده محصولات",
    ctaHref: b.linkUrl || "/products",
    imageUrl: b.imageUrl,
  };
}

export default function HeroCarousel({ banners }: { banners: Banner[] }) {
  const slides: Slide[] = banners.length > 0 ? banners.map(bannerToSlide) : [DEFAULT_SLIDE];
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [imageOk, setImageOk] = useState(false);
  const { setOpen: openAiAdvisor } = useAiAdvisor();

  // Verify the banner image actually loads before rendering it — done via an
  // imperative preload (not the <img>'s own onError) because on an SSR'd
  // page the native error can fire before React finishes hydrating and
  // attaching the handler, especially for a fast-failing 404.
  useEffect(() => {
    const url = slides[index].imageUrl;
    if (!url) {
      setImageOk(false);
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.onload = () => !cancelled && setImageOk(true);
    img.onerror = () => !cancelled && setImageOk(false);
    img.src = url;
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  const next = useCallback(() => setIndex((i) => (i + 1) % slides.length), [slides.length]);
  const prev = () => setIndex((i) => (i - 1 + slides.length) % slides.length);

  useEffect(() => {
    if (paused || slides.length <= 1) return;
    const timer = setInterval(next, 5500);
    return () => clearInterval(timer);
  }, [paused, next, slides.length]);

  const slide = slides[index];

  return (
    <section
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className="relative isolate overflow-hidden rounded-[2rem] border border-border-color bg-gradient-to-br from-surface via-surface to-[#0a1120]"
    >
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -top-16 -left-16 h-72 w-72 rounded-full bg-brand/10 blur-3xl"
        animate={{ opacity: [0.35, 0.5, 0.35] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-20 right-0 h-64 w-64 rounded-full bg-accent-purple/[0.06] blur-3xl"
      />

      <AnimatePresence mode="wait">
        <motion.div
          key={index}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ duration: 0.5, ease: easeOut }}
          className="relative grid gap-6 p-8 sm:p-12 md:grid-cols-2 md:items-center md:gap-4"
        >
          <div className="relative z-10 order-2 md:order-1">
            <span className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-brand/10 px-4 py-1.5 text-xs font-medium text-brand">
              <span className="h-1.5 w-1.5 rounded-full bg-brand" />
              فروشگاه آنلاین سلطان نور
            </span>

            <h1 className="max-w-lg text-4xl font-extrabold leading-[1.15] sm:text-5xl">
              {slide.title} {slide.accentWord && <span className="gradient-text">{slide.accentWord}</span>}
            </h1>

            <p className="mt-5 max-w-md text-lg text-muted">{slide.subtitle}</p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
                <Link
                  href={slide.ctaHref}
                  className="inline-block rounded-xl bg-brand px-6 py-3 font-bold text-[#0b0e14] shadow-lg shadow-brand/20 transition-shadow hover:shadow-xl"
                >
                  {slide.ctaLabel} ←
                </Link>
              </motion.div>
              <motion.button
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => openAiAdvisor(true)}
                className="inline-flex items-center gap-2 rounded-xl border border-border-color px-6 py-3 font-bold text-foreground transition hover:border-brand hover:text-brand"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M12 3a7 7 0 0 0-7 7c0 2 .8 3.7 2 5v2.5a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V15c1.2-1.3 2-3 2-5a7 7 0 0 0-7-7Z" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M10 21h4" strokeLinecap="round" />
                </svg>
                مشاوره هوشمند
              </motion.button>
            </div>
          </div>

          <div className="relative z-10 order-1 flex items-center justify-center md:order-2">
            {slide.imageUrl && imageOk ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={slide.imageUrl} alt={slide.title} className="max-h-72 w-full rounded-2xl object-cover" />
            ) : (
              <HeroIllustration />
            )}
          </div>
        </motion.div>
      </AnimatePresence>

      {slides.length > 1 && (
        <>
          <button
            onClick={prev}
            aria-label="اسلاید قبلی"
            className="absolute top-1/2 right-4 z-20 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-surface/70 text-foreground backdrop-blur transition hover:bg-brand hover:text-[#0b0e14]"
          >
            ›
          </button>
          <button
            onClick={next}
            aria-label="اسلاید بعدی"
            className="absolute top-1/2 left-4 z-20 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-surface/70 text-foreground backdrop-blur transition hover:bg-brand hover:text-[#0b0e14]"
          >
            ‹
          </button>
          <div className="absolute bottom-5 left-1/2 z-20 flex -translate-x-1/2 gap-2">
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={() => setIndex(i)}
                aria-label={`اسلاید ${i + 1}`}
                className={`h-1.5 rounded-full transition-all ${i === index ? "w-6 bg-brand" : "w-1.5 bg-foreground/25"}`}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
