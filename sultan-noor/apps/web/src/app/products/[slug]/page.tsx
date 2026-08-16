import type { Metadata } from "next";
import { apiFetch } from "@/lib/api";
import { Product } from "@/lib/types";
import ProductDetailClient from "./ProductDetailClient";

async function getProduct(slug: string) {
  try {
    return await apiFetch<Product>(`/products/${slug}`);
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) return { title: "محصول یافت نشد | سلطان نور" };

  const description =
    product.description?.slice(0, 160) ??
    `${product.name}${product.brand ? ` از برند ${product.brand.name}` : ""} — خرید آنلاین از فروشگاه سلطان نور با ارسال سریع.`;

  return {
    title: `${product.name} | سلطان نور`,
    description,
    openGraph: {
      title: product.name,
      description,
      type: "website",
      images: product.images?.[0]?.url ? [product.images[0].url] : undefined,
    },
  };
}

export default function ProductDetailPage() {
  return <ProductDetailClient />;
}
