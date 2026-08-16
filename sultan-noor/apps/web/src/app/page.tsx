import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { Banner, Category, Product, Brand, BlogPost } from "@/lib/types";
import ProductGrid from "@/components/ProductGrid";
import HeroCarousel from "@/components/HeroCarousel";
import RevealSection from "@/components/RevealSection";
import TrustBadges from "@/components/TrustBadges";
import SectionDivider from "@/components/SectionDivider";
import CategoryShowcase from "@/components/CategoryShowcase";
import FeaturedDeals from "@/components/FeaturedDeals";
import TrustedBrands from "@/components/TrustedBrands";
import LatestBlogPosts from "@/components/LatestBlogPosts";
import FinalCta from "@/components/FinalCta";
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
  const [banners, productsRes, categories, bestSellers, brands, blogPosts] = await Promise.all([
    safeGet<Banner[]>("/banners?placement=HOME_HERO", []),
    safeGet<{ items: Product[] }>("/products?take=24", { items: [] }),
    safeGet<Category[]>("/categories", []),
    safeGet<Product[]>("/products/best-sellers?take=8", []),
    safeGet<Brand[]>("/brands", []),
    safeGet<BlogPost[]>("/blog", []),
  ]);

  const deals = productsRes.items.filter(
    (p) => p.compareAtPrice && Number(p.compareAtPrice) > Number(p.basePrice),
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-5 sm:py-8">
      <HeroCarousel banners={banners} />

      {categories.length > 0 && (
        <>
          <div className="mt-8 sm:mt-14" />
          <RevealSection>
            <div className="mb-4 flex items-center justify-between sm:mb-6">
              <h2 className="text-lg font-bold sm:text-xl">
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

      {bestSellers.length > 0 && (
        <>
          <SectionDivider />
          <RevealSection>
            <div className="mb-4 flex items-center justify-between sm:mb-6">
              <h2 className="text-lg font-bold sm:text-xl">
                محصولات <span className="gradient-text">پرفروش</span>
              </h2>
              <Link href="/products" className="text-sm font-medium text-brand transition hover:text-brand-dark">
                مشاهده همه ←
              </Link>
            </div>
            <ProductGrid products={bestSellers} />
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

      {productsRes.items.length === 0 && bestSellers.length === 0 && (
        <>
          <SectionDivider />
          <RevealSection>
            <p className="rounded-xl border border-dashed border-border-color p-6 text-sm text-foreground/60">
              هنوز محصولی ثبت نشده است. برای شروع، از پنل مدیریت محصول اضافه کنید یا دستور <code>pnpm seed</code> را در
              <code> apps/api</code> اجرا کنید.
            </p>
          </RevealSection>
        </>
      )}

      {brands.length > 0 && (
        <>
          <SectionDivider />
          <RevealSection>
            <h2 className="mb-4 text-lg font-bold sm:mb-6 sm:text-xl">
              برندهای <span className="gradient-text">معتبر</span>
            </h2>
            <TrustedBrands brands={brands} />
          </RevealSection>
        </>
      )}

      <SectionDivider />

      <RevealSection>
        <B2BSection />
      </RevealSection>

      <SectionDivider />

      <RevealSection>
        <AiAdvisorPromoCard />
      </RevealSection>

      <SectionDivider />

      <RevealSection>
        <h2 className="mb-4 text-lg font-bold sm:mb-6 sm:text-xl">
          چرا <span className="gradient-text">سلطان نور</span>؟
        </h2>
        <TrustBadges />
      </RevealSection>

      {blogPosts.length > 0 && (
        <>
          <SectionDivider />
          <RevealSection>
            <div className="mb-4 flex items-center justify-between sm:mb-6">
              <h2 className="text-lg font-bold sm:text-xl">
                آخرین <span className="gradient-text">مقالات</span>
              </h2>
              <Link href="/blog" className="text-sm font-medium text-brand transition hover:text-brand-dark">
                مشاهده همه ←
              </Link>
            </div>
            <LatestBlogPosts posts={blogPosts.slice(0, 3)} />
          </RevealSection>
        </>
      )}

      <SectionDivider />

      <RevealSection>
        <FinalCta />
      </RevealSection>
    </div>
  );
}
