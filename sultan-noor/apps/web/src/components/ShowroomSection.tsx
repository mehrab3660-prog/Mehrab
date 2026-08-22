"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, API_ORIGIN } from "@/lib/api";
import { useCart } from "@/context/CartContext";
import type { SceneHotspot } from "@/lib/types";

function formatToman(value: string | number) {
  return `${Number(value).toLocaleString("fa-IR")} تومان`;
}

// Real product data only — resolved once here so both the hero and the
// floorplan hotspots share the exact same catalog-verified list.
function resolveHotspots(hotspots: SceneHotspot[]) {
  return hotspots.map((h) => ({
    ...h,
    product: {
      ...h.product,
      imageUrl: h.product.imageUrl && !h.product.imageUrl.startsWith("http") ? `${API_ORIGIN}${h.product.imageUrl}` : h.product.imageUrl,
    },
  }));
}

function HotspotMarker({ hotspot, onOpen }: { hotspot: SceneHotspot; onOpen: (h: SceneHotspot) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(hotspot)}
      aria-label={`مشاهده محصول: ${hotspot.product.name}`}
      style={{ left: `${hotspot.position.x}%`, top: `${hotspot.position.y}%` }}
      className="absolute flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 animate-pulse items-center justify-center rounded-full border-2 border-brand bg-black/70 text-sm shadow-[0_0_16px_rgba(245,184,46,0.6)] transition hover:animate-none hover:scale-110 sm:h-9 sm:w-9 sm:text-base"
    >
      {hotspot.icon}
    </button>
  );
}

function HotspotPopover({ hotspot, onClose }: { hotspot: SceneHotspot; onClose: () => void }) {
  const { addItem } = useCart();
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const p = hotspot.product;

  async function handleAddToCart() {
    setAdding(true);
    try {
      await addItem(p.id, 1);
      setAdded(true);
    } catch {
      // Silently ignored — "مشاهده محصول" below still works as a fallback.
    } finally {
      setAdding(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-label={p.name}
      className="absolute bottom-3 left-1/2 z-20 w-[min(92%,320px)] -translate-x-1/2 rounded-2xl border border-border-color bg-surface/95 p-4 shadow-2xl backdrop-blur"
    >
      <button onClick={onClose} aria-label="بستن" className="absolute left-3 top-3 text-foreground/50 hover:text-foreground">
        ✕
      </button>
      <div className="flex gap-3">
        {p.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.imageUrl} alt={p.name} className="h-16 w-16 shrink-0 rounded-lg object-cover" />
        ) : (
          <div className="h-16 w-16 shrink-0 rounded-lg bg-surface-2" />
        )}
        <div className="min-w-0 flex-1">
          {p.brand && <p className="truncate text-xs text-foreground/50">{p.brand}</p>}
          <p className="truncate text-sm font-bold">{p.name}</p>
          <p className="mt-1 text-sm font-extrabold text-brand">{formatToman(p.price)}</p>
          <p className={`text-xs ${p.inStock ? "text-emerald-400" : "text-red-400"}`}>{p.inStock ? "موجود" : "ناموجود"}</p>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <a
          href={`/products/${p.slug}`}
          className="flex-1 rounded-lg border border-border-color py-2 text-center text-xs font-bold hover:border-brand/50"
        >
          مشاهده محصول
        </a>
        <button
          onClick={handleAddToCart}
          disabled={!p.inStock || adding || added}
          className="flex-1 rounded-lg bg-brand py-2 text-xs font-bold text-[#0b0e14] disabled:opacity-50"
        >
          {added ? "افزوده شد ✓" : adding ? "..." : "افزودن به سبد"}
        </button>
      </div>
    </div>
  );
}

// Always real, always crawlable, regardless of whether JS/images load:
// every hotspot's product page as a plain <a> link.
function HotspotLinkList({ hotspots }: { hotspots: SceneHotspot[] }) {
  if (hotspots.length === 0) return null;
  return (
    <nav aria-label="محصولات نمایشگر خانه هوشمند" className="sr-only">
      {hotspots.map((h) => (
        <Link key={h.id} href={`/products/${h.product.slug}`}>
          {h.product.name}
        </Link>
      ))}
    </nav>
  );
}

const BENEFITS = [
  { icon: "🚚", label: "ارسال سریع" },
  { icon: "🛡️", label: "ضمانت اصالت کالا" },
  { icon: "🔒", label: "پرداخت امن" },
  { icon: "↻", label: "۷ روز ضمانت بازگشت" },
];

export default function ShowroomSection() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [hotspots, setHotspots] = useState<SceneHotspot[]>([]);
  const [activeHotspot, setActiveHotspot] = useState<SceneHotspot | null>(null);

  useEffect(() => {
    api
      .get<{ enabled: boolean }>("/scene/config")
      .then((res) => setEnabled(res.enabled))
      .catch(() => setEnabled(false)); // fail closed: an unreachable API means "show the plain storefront"
    api
      .get<SceneHotspot[]>("/scene/hotspots")
      .then((res) => setHotspots(resolveHotspots(res)))
      .catch(() => setHotspots([]));
  }, []);

  if (enabled === false) return null;

  if (enabled === null) {
    return (
      <div className="mt-6 sm:mt-10">
        <div className="aspect-[16/10] w-full animate-pulse rounded-2xl bg-surface-2 sm:aspect-[21/9]" />
      </div>
    );
  }

  return (
    <div className="mt-6 sm:mt-10">
      {/* Hero: a real house, real copy, real CTA — no fabricated content */}
      <div
        className="relative overflow-hidden rounded-2xl border border-border-color bg-cover bg-center"
        style={{ backgroundImage: "linear-gradient(90deg, rgba(3,7,10,.94) 0%, rgba(3,7,10,.25) 45%, rgba(3,7,10,.75) 100%), url('/images/showroom/hero-house.jpg')" }}
      >
        <div className="flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-10">
          <div className="text-center sm:text-right">
            <h1 className="text-3xl font-extrabold leading-tight text-white sm:text-4xl">
              روشنایی <span className="text-brand">زندگی شما</span>
            </h1>
            <p className="mt-3 text-sm text-white/80 sm:text-base">فروشگاه تخصصی تجهیزات روشنایی با بهترین کیفیت و قیمت</p>
            <Link
              href="/products"
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-brand px-6 py-3 text-sm font-extrabold text-[#0b0e14] shadow-lg shadow-brand/20"
            >
              مشاهده محصولات ←
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:w-56 sm:shrink-0 sm:flex-col">
            {BENEFITS.map((b) => (
              <div key={b.label} className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/40 px-3 py-2 backdrop-blur-sm">
                <span aria-hidden="true">{b.icon}</span>
                <span className="text-xs font-bold text-white">{b.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Smart-home showroom: real product hotspots on a real interior render */}
      <div className="mt-6 grid gap-4 rounded-2xl border border-border-color bg-surface p-4 sm:mt-8 sm:grid-cols-[280px_1fr] sm:gap-6 sm:p-6">
        <div className="flex flex-col justify-center gap-3 text-center sm:text-right">
          <p className="text-sm font-bold text-brand">خانه هوشمند</p>
          <h2 className="text-xl font-extrabold sm:text-2xl">تجربه‌ای متفاوت</h2>
          <p className="text-sm text-foreground/60">با کلیک روی هر نقطه، تجهیزات واقعی سلطان نور را ببینید و مستقیم به سبد اضافه کنید.</p>
        </div>
        <div className="relative aspect-[705/245] w-full overflow-hidden rounded-xl bg-black">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/showroom/floorplan.jpg" alt="نمای داخلی خانه هوشمند سلطان نور" className="h-full w-full object-cover" />
          {hotspots.map((h) => (
            <HotspotMarker key={h.id} hotspot={h} onOpen={setActiveHotspot} />
          ))}
          {activeHotspot && <HotspotPopover hotspot={activeHotspot} onClose={() => setActiveHotspot(null)} />}
        </div>
      </div>

      <HotspotLinkList hotspots={hotspots} />
    </div>
  );
}
