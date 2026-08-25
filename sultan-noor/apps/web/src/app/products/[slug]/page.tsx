import type { Metadata } from "next";
import { apiFetch } from "@/lib/api";
import { Product } from "@/lib/types";
import { JsonLd, SITE_URL } from "@/lib/jsonld";
import ProductDetailClient from "./ProductDetailClient";

interface PublicReview {
  id: string;
  rating: number;
  title?: string | null;
  body?: string | null;
  createdAt: string;
  user: { fullName: string | null };
}

interface PublicQuestion {
  id: string;
  body: string;
  answers: { id: string; body: string }[];
}

async function getProduct(slug: string) {
  try {
    return await apiFetch<Product>(`/products/${slug}`);
  } catch {
    return null;
  }
}

async function safeGet<T>(path: string, fallback: T): Promise<T> {
  try {
    return await apiFetch<T>(path);
  } catch {
    return fallback;
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

export default async function ProductDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await getProduct(slug);

  if (!product) return <ProductDetailClient />;

  const [reviews, questions] = await Promise.all([
    safeGet<PublicReview[]>(`/reviews?productId=${product.id}`, []),
    safeGet<PublicQuestion[]>(`/qa/questions?productId=${product.id}`, []),
  ]);

  const productUrl = `${SITE_URL}/products/${product.slug}`;

  // Iran's ISO 4217 currency code is IRR (rial); the site's own displayed
  // price is in toman (1 toman = 10 rials), so it's converted here rather
  // than mislabeling a toman figure as rials.
  const offer = {
    "@type": "Offer",
    url: productUrl,
    priceCurrency: "IRR",
    price: String(Math.round(Number(product.basePrice) * 10)),
    availability: (product.totalStock ?? 0) > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
  };

  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description ?? undefined,
    image: product.images?.map((img) => img.url),
    sku: product.variants?.[0]?.sku,
    brand: product.brand ? { "@type": "Brand", name: product.brand.name } : undefined,
    category: product.category?.name,
    offers: offer,
    // Only present when there's at least one real review — never a
    // fabricated rating for a product nobody has actually reviewed.
    aggregateRating:
      product.reviewCount && product.reviewCount > 0
        ? {
            "@type": "AggregateRating",
            ratingValue: product.avgRating,
            reviewCount: product.reviewCount,
          }
        : undefined,
    review: reviews.slice(0, 10).map((r) => ({
      "@type": "Review",
      author: { "@type": "Person", name: r.user.fullName ?? "کاربر سلطان نور" },
      datePublished: r.createdAt,
      reviewRating: { "@type": "Rating", ratingValue: r.rating, bestRating: 5 },
      name: r.title ?? undefined,
      reviewBody: r.body ?? undefined,
    })),
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "خانه", item: SITE_URL },
      ...(product.category
        ? [
            {
              "@type": "ListItem",
              position: 2,
              name: product.category.name,
              item: `${SITE_URL}/products?category=${product.category.id}`,
            },
          ]
        : []),
      {
        "@type": "ListItem",
        position: product.category ? 3 : 2,
        name: product.name,
        item: productUrl,
      },
    ],
  };

  const answeredQuestions = questions.filter((q) => q.answers.length > 0);
  const faqJsonLd = answeredQuestions.length
    ? {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: answeredQuestions.map((q) => ({
          "@type": "Question",
          name: q.body,
          acceptedAnswer: { "@type": "Answer", text: q.answers[0].body },
        })),
      }
    : null;

  return (
    <>
      <JsonLd data={productJsonLd} />
      <JsonLd data={breadcrumbJsonLd} />
      {faqJsonLd && <JsonLd data={faqJsonLd} />}
      <ProductDetailClient />
    </>
  );
}
