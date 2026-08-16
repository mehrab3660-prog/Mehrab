import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { Banner, Category, Product } from "@/lib/types";
import ProductGrid from "@/components/ProductGrid";
import HeroCarousel from "@/components/HeroCarousel";
import RevealSection from "@/components/RevealSection";
import TrustBadges from "@/components/TrustBadges";
import SectionDivider from "@/components/SectionDivider";
import CategoryShowcase from "@/components/CategoryShowcase";
import FeaturedDeals from "@/components/FeaturedDeals";
import PromoBanners from "@/components/PromoBanners";
import B2BSection from "@/components/B2BSection";
import AiAdvisorPromoCard from "@/components/AiAdvisorPromoCard";

async function safeGet<T>(path: string, fallback: T): Promise<T> {
  try {
    return await apiFetch<T>(path);
  } catch {
    return fallback;
  }
}

export default async function HomePage() {
  const [banners, productsRes, categories] = await Promise.all([
    safeGet<Banner[]>("/banners?placement=HOME_HERO", []),
    safeGet<{ items: Product[] }>("/products?take=24", { items: [] }),
    safeGet<Category[]>("/categories", []),
  ]);

  const deals = productsRes.items.filter(
    (p) => p.compareAtPrice && Number(p.compareAtPrice) > Number(p.basePrice),
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <HeroCarousel banners={banners} />

      <div className="mt-14">
        <TrustBadges />
      </div>

      {categories.length > 0 && (
        <>
          <SectionDivider />
          <RevealSection>
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-xl font-bold">
                دسته‌بندی <span className="gradient-text">محصولات</span>
              </h2>
              <Link href="/products" className="text-sm font-medium text-brand transition hover:text-brand-dark">
                مشاهده همه ←
              </Link>
            </div>
            <CategoryShowcase categories={categories} />
          </RevealSection>
        </>
      )}

      {deals.length > 0 && (
        <>
          <SectionDivider />
          <RevealSection>
            <FeaturedDeals products={deals} />
          </RevealSection>
        </>
      )}

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
          <ProductGrid products={productsRes.items.slice(0, 8)} />
        )}
      </RevealSection>

      <SectionDivider />

      <RevealSection>
        <PromoBanners />
      </RevealSection>

      <SectionDivider />

      <RevealSection>
        <B2BSection />
      </RevealSection>

      <SectionDivider />

      <RevealSection>
        <AiAdvisorPromoCard />
      </RevealSection>
    </div>
  );
}
