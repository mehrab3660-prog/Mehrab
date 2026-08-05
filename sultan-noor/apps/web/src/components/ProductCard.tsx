import Link from "next/link";
import { Product } from "@/lib/types";

function formatToman(value: string | number) {
  return `${Number(value).toLocaleString("fa-IR")} تومان`;
}

export default function ProductCard({ product }: { product: Product }) {
  const image = product.images?.[0]?.url;
  const hasDiscount = product.compareAtPrice && Number(product.compareAtPrice) > Number(product.basePrice);

  return (
    <Link
      href={`/products/${product.slug}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-border-color bg-surface transition hover:shadow-lg"
    >
      <div className="aspect-square w-full overflow-hidden bg-black/5">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt={product.name}
            className="h-full w-full object-cover transition group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-foreground/40">بدون تصویر</div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        {product.brand && <span className="text-xs text-foreground/50">{product.brand.name}</span>}
        <h3 className="line-clamp-2 text-sm font-medium">{product.name}</h3>
        <div className="mt-auto flex items-center gap-2 pt-2">
          <span className="text-base font-bold text-brand">{formatToman(product.basePrice)}</span>
          {hasDiscount && (
            <span className="text-xs text-foreground/40 line-through">{formatToman(product.compareAtPrice!)}</span>
          )}
        </div>
      </div>
    </Link>
  );
}
