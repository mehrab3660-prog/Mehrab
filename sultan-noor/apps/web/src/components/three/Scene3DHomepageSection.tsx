"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { api } from "@/lib/api";
import type { SceneHotspot, Category } from "@/lib/types";
import { useWebglSupported } from "./useWebglSupported";
import { Scene3DErrorBoundary } from "./Scene3DErrorBoundary";

const Hero3DScene = dynamic(() => import("./Hero3DScene"), { ssr: false });

// Real categories only — a keyword that doesn't match any category the
// store actually has is simply skipped, never linked to a fake page
// (Sprint 9 §6/§19).
const CATEGORY_SHORTCUTS: { icon: string; keywords: string[] }[] = [
  { icon: "💡", keywords: ["روشنایی", "لامپ"] },
  { icon: "🔌", keywords: ["کلید", "پریز"] },
  { icon: "⚡", keywords: ["برق", "تجهیزات"] },
  { icon: "🏠", keywords: ["هوشمند"] },
];

function findCategory(categories: Category[], keywords: string[]) {
  return categories.find((c) => keywords.some((k) => c.name.includes(k)));
}

// Always real, always crawlable: every hotspot's product page as a plain
// <a> link. Visually hidden while the 3D scene renders successfully (screen
// readers still get it); shown as the real content when 3D can't run.
function HotspotLinkList({ hotspots, visible }: { hotspots: SceneHotspot[]; visible: boolean }) {
  if (hotspots.length === 0) return null;
  return (
    <nav aria-label="محصولات نمایشگر سه‌بعدی" className={visible ? "grid grid-cols-2 gap-2 sm:grid-cols-4" : "sr-only"}>
      {hotspots.map((h) => (
        <Link
          key={h.id}
          href={`/products/${h.product.slug}`}
          className="flex items-center gap-2 rounded-xl border border-border-color bg-surface px-3 py-2 text-xs font-medium transition hover:border-brand/50"
        >
          <span aria-hidden="true">{h.icon}</span>
          <span className="truncate">{h.product.name}</span>
        </Link>
      ))}
    </nav>
  );
}

function StaticFallback({ hotspots }: { hotspots: SceneHotspot[] }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 rounded-2xl bg-gradient-to-br from-surface to-surface-2 p-6 text-center">
      <span className="text-4xl">💡🔌⚡🏠</span>
      <p className="text-sm text-foreground/60">نمایشگر سه‌بعدی روی این دستگاه/مرورگر در دسترس نیست</p>
      <HotspotLinkList hotspots={hotspots} visible />
    </div>
  );
}

export default function Scene3DHomepageSection({ categories }: { categories: Category[] }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [hotspots, setHotspots] = useState<SceneHotspot[]>([]);
  const [inView, setInView] = useState(false);
  const webglSupported = useWebglSupported();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api
      .get<{ enabled: boolean }>("/scene/config")
      .then((res) => setEnabled(res.enabled))
      .catch(() => setEnabled(false)); // fail closed: an unreachable API means "show the plain storefront"
    api
      .get<SceneHotspot[]>("/scene/hotspots")
      .then(setHotspots)
      .catch(() => setHotspots([]));
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const categoryShortcuts = CATEGORY_SHORTCUTS.map((s) => ({ ...s, category: findCategory(categories, s.keywords) })).filter(
    (s) => s.category,
  );

  if (enabled === false) return null;

  const show3d = enabled && inView && webglSupported;

  return (
    <div ref={containerRef} className="mt-6 sm:mt-10">
      <div className="mb-4 flex items-center justify-between sm:mb-6">
        <h2 className="text-lg font-bold sm:text-xl">
          نمایشگر <span className="gradient-text">سه‌بعدی</span> سلطان نور
        </h2>
      </div>

      <div className="relative aspect-[16/10] w-full overflow-hidden rounded-2xl border border-border-color sm:aspect-[21/9]">
        {show3d ? (
          <Scene3DErrorBoundary fallback={<StaticFallback hotspots={hotspots} />}>
            <Hero3DScene hotspots={hotspots} />
          </Scene3DErrorBoundary>
        ) : webglSupported === false || enabled === null ? (
          <StaticFallback hotspots={hotspots} />
        ) : (
          <div className="h-full w-full animate-pulse bg-surface-2" />
        )}
      </div>

      {show3d && <HotspotLinkList hotspots={hotspots} visible={false} />}

      {categoryShortcuts.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {categoryShortcuts.map((s) => (
            <Link
              key={s.category!.id}
              href={`/products?category=${s.category!.id}`}
              className="flex flex-col items-center gap-1 rounded-xl border border-border-color bg-surface p-4 text-center transition hover:border-brand/50"
            >
              <span className="text-2xl">{s.icon}</span>
              <span className="text-sm font-bold">{s.category!.name}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
