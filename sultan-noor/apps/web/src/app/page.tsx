import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { Banner, Product } from "@/lib/types";
import ProductGrid from "@/components/ProductGrid";
import HomeHero from "@/components/HomeHero";
import RevealSection from "@/components/RevealSection";
import TrustBadges from "@/components/TrustBadges";
import SectionDivider from "@/components/SectionDivider";

async function safeGet<T>(path: string, fallback: T): Promise<T> {
  try {
    return await apiFetch<T>(path);
  } catch {
    return fallback;
  }
}

export default async function HomePage() {
  const [banners, productsRes] = await Promise.all([
    safeGet<Banner[]>("/banners?placement=HOME_HERO", []),
    safeGet<{ items: Product[] }>("/products?take=8", { items: [] }),
  ]);

  const hero = banners[0];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <HomeHero title={hero?.title} />

      <div className="mt-14">
        <TrustBadges />
      </div>

      <SectionDivider />

      <RevealSection>
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-bold">
            محصولات <span className="gradient-text">پیشنهادی</span>
          </h2>
          <Link href="/products" className="text-sm font-medium text-brand transition hover:text-brand-dark">
            مشاهده همه ←
          </Link>
        </div>
        {productsRes.items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border-color p-6 text-sm text-foreground/60">
            هنوز محصولی ثبت نشده است. برای شروع، از پنل مدیریت محصول اضافه کنید یا دستور <code>pnpm seed</code> را در
            <code> apps/api</code> اجرا کنید.
          </p>
        ) : (
          <ProductGrid products={productsRes.items} />
        )}
      </RevealSection>
    </div>
  );
}
