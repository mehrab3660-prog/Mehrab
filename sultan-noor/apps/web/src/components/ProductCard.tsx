"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Product } from "@/lib/types";
import { fadeUp } from "@/lib/motion";

function formatToman(value: string | number) {
  return `${Number(value).toLocaleString("fa-IR")} تومان`;
}

export default function ProductCard({ product }: { product: Product }) {
  const image = product.images?.[0]?.url;
  const hasDiscount = product.compareAtPrice && Number(product.compareAtPrice) > Number(product.basePrice);

  return (
    <motion.div variants={fadeUp} whileHover={{ y: -6 }} transition={{ type: "spring", stiffness: 300, damping: 22 }}>
      <Link
        href={`/products/${product.slug}`}
        className="group flex h-full flex-col overflow-hidden rounded-2xl surface-card transition-shadow duration-300 hover:glow-shadow"
      >
        <div className="relative aspect-square w-full overflow-hidden bg-surface-2">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image}
              alt={product.name}
              className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-110"
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
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/10 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
        </div>
        <div className="flex flex-1 flex-col gap-1 p-4">
          {product.brand && <span className="text-xs text-foreground/45">{product.brand.name}</span>}
          <h3 className="line-clamp-2 text-sm font-medium leading-6">{product.name}</h3>
          <div className="mt-auto flex items-center gap-2 pt-3">
            <span className="text-base font-bold text-brand">{formatToman(product.basePrice)}</span>
            {hasDiscount && (
              <span className="text-xs text-foreground/40 line-through">{formatToman(product.compareAtPrice!)}</span>
            )}
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
