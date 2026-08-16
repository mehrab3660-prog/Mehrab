"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Product } from "@/lib/types";
import { fadeUp } from "@/lib/motion";
import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import { useWishlist } from "@/context/WishlistContext";
import { useToast } from "@/context/ToastContext";

function formatToman(value: string | number) {
  return `${Number(value).toLocaleString("fa-IR")} تومان`;
}

function RatingStars({ rating, count }: { rating: number; count: number }) {
  return (
    <div className="flex items-center gap-1 text-xs">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="#F5B82E">
        <path d="m12 2 2.9 6.6 7.1.7-5.4 4.7 1.6 7-6.2-3.7L5.8 21l1.6-7L2 9.3l7.1-.7L12 2Z" />
      </svg>
      <span className="font-bold">{rating.toFixed(1)}</span>
      <span className="text-muted">({count.toLocaleString("fa-IR")})</span>
    </div>
  );
}

export default function ProductCard({ product }: { product: Product }) {
  const { user } = useAuth();
  const { addItem } = useCart();
  const { itemIds, toggle } = useWishlist();
  const { toast } = useToast();

  const image = product.images?.[0]?.url;
  const hasDiscount = product.compareAtPrice && Number(product.compareAtPrice) > Number(product.basePrice);
  const discountPercent = hasDiscount
    ? Math.round((1 - Number(product.basePrice) / Number(product.compareAtPrice)) * 100)
    : 0;
  const isWishlisted = itemIds.has(product.id);
  const stockLabel =
    product.totalStock === undefined
      ? null
      : product.totalStock <= 0
        ? { text: "ناموجود", className: "bg-surface-2 text-foreground/50" }
        : product.totalStock <= 5
          ? { text: "موجودی محدود", className: "bg-brand/10 text-brand" }
          : null;

  function handleWishlist(e: React.MouseEvent) {
    e.preventDefault();
    if (!user) {
      toast("برای افزودن به علاقه‌مندی‌ها ابتدا وارد شوید.", "info");
      return;
    }
    const wasWishlisted = isWishlisted;
    toggle(product.id);
    toast(wasWishlisted ? "از علاقه‌مندی‌ها حذف شد." : "به علاقه‌مندی‌ها اضافه شد.", "success");
  }

  async function handleQuickAdd(e: React.MouseEvent) {
    e.preventDefault();
    if (!user) {
      toast("برای افزودن به سبد خرید ابتدا وارد شوید.", "info");
      return;
    }
    if (product.totalStock !== undefined && product.totalStock <= 0) {
      toast("این محصول در حال حاضر ناموجود است.", "error");
      return;
    }
    try {
      await addItem(product.id, 1, product.variants?.[0]?.id);
      toast("به سبد خرید اضافه شد.", "success");
    } catch {
      toast("افزودن به سبد خرید با خطا مواجه شد.", "error");
    }
  }

  return (
    <motion.div
      variants={fadeUp}
      whileHover={{ y: -6 }}
      transition={{ type: "spring", stiffness: 300, damping: 22 }}
      className="group relative"
    >
      <div className="absolute -inset-px rounded-2xl bg-gradient-to-br from-brand-light to-brand opacity-0 blur-[2px] transition-opacity duration-300 group-hover:opacity-50" />

      <Link
        href={`/products/${product.slug}`}
        className="relative flex h-full flex-col overflow-hidden rounded-2xl surface-card transition-shadow duration-300 group-hover:glow-shadow"
      >
        <div className="relative aspect-square w-full overflow-hidden bg-surface-2">
          <div className="absolute inset-x-3 top-3 z-10 flex items-start justify-between">
            {hasDiscount ? (
              <span className="rounded-full bg-gradient-to-l from-brand-light to-brand px-2.5 py-1 text-xs font-bold text-[#0b0e14] shadow">
                ٪{discountPercent}−
              </span>
            ) : (
              <span />
            )}
            <motion.button
              whileTap={{ scale: 0.85 }}
              onClick={handleWishlist}
              aria-label="افزودن به علاقه‌مندی‌ها"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-surface/80 text-foreground/70 backdrop-blur transition-colors hover:text-brand sm:h-8 sm:w-8"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill={isWishlisted ? "#F5B82E" : "none"} stroke="currentColor" strokeWidth="1.8">
                <path d="M12 20.5s-7.5-4.6-9.9-9.2C.5 7.9 2 4.5 5.4 3.7c2-.5 3.9.3 5 1.9a.7.7 0 0 0 1.2 0c1.1-1.6 3-2.4 5-1.9 3.4.8 4.9 4.2 3.3 7.6-2.4 4.6-9.9 9.2-9.9 9.2Z" />
              </svg>
            </motion.button>
          </div>

          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image}
              alt={product.name}
              className={`h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-110 ${product.totalStock === 0 ? "opacity-50 grayscale" : ""}`}
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-surface-2 to-background text-foreground/30">
              <motion.svg
                animate={{ opacity: [0.5, 0.9, 0.5] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                width="36"
                height="36"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="text-brand/50"
              >
                <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.4.3.7.8.7 1.3v.3h5.6v-.3c0-.5.3-1 .7-1.3A6 6 0 0 0 12 3Z" />
              </motion.svg>
              <span className="text-xs">بدون تصویر</span>
            </div>
          )}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

          {product.totalStock !== 0 && (
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={handleQuickAdd}
              className="pointer-events-auto absolute inset-x-3 bottom-3 flex translate-y-0 items-center justify-center gap-1.5 rounded-lg bg-brand py-2.5 text-xs font-bold text-[#0b0e14] opacity-100 shadow-lg transition-all duration-300 sm:pointer-events-none sm:translate-y-2 sm:opacity-0 sm:group-hover:pointer-events-auto sm:group-hover:translate-y-0 sm:group-hover:opacity-100"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 6h2l2.4 11.4a2 2 0 0 0 2 1.6h7.2a2 2 0 0 0 2-1.6L20 8H6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              افزودن به سبد
            </motion.button>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-1.5 p-4">
          <div className="flex items-center justify-between gap-2">
            {product.brand && <span className="text-xs text-muted">{product.brand.name}</span>}
            {stockLabel && (
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${stockLabel.className}`}>{stockLabel.text}</span>
            )}
          </div>
          <h3 className="line-clamp-2 text-sm font-medium leading-6">{product.name}</h3>
          {!!product.avgRating && <RatingStars rating={product.avgRating} count={product.reviewCount ?? 0} />}
          <div className="mt-auto flex items-center gap-2 pt-2">
            <span className="text-base font-bold text-brand">{formatToman(product.basePrice)}</span>
            {hasDiscount && (
              <span className="text-xs text-muted line-through">{formatToman(product.compareAtPrice!)}</span>
            )}
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
