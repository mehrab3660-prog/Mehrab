"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { Product } from "@/lib/types";
import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import { useWishlist } from "@/context/WishlistContext";
import { useToast } from "@/context/ToastContext";
import ProductGrid from "@/components/ProductGrid";
import RecentlyViewed from "@/components/RecentlyViewed";
import { addRecentlyViewed } from "@/lib/recentlyViewed";

interface Review {
  id: string;
  rating: number;
  title?: string | null;
  body?: string | null;
  user: { fullName: string | null };
  images: { id: string; url: string }[];
}

interface Question {
  id: string;
  body: string;
  user: { fullName: string | null };
  answers: { id: string; body: string; isFromStaff: boolean }[];
}

function formatToman(value: string | number) {
  return `${Number(value).toLocaleString("fa-IR")} تومان`;
}

function ProductDetailSkeleton() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="grid gap-8 md:grid-cols-2">
        <div className="space-y-3">
          <div className="skeleton aspect-square w-full rounded-2xl" />
          <div className="flex gap-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="skeleton h-16 w-16 rounded-lg" />
            ))}
          </div>
        </div>
        <div className="space-y-4">
          <div className="skeleton h-4 w-24 rounded" />
          <div className="skeleton h-8 w-3/4 rounded" />
          <div className="skeleton h-5 w-32 rounded" />
          <div className="skeleton h-9 w-48 rounded" />
          <div className="skeleton h-24 w-full rounded" />
          <div className="skeleton h-12 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}

export default function ProductDetailClient() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const { user, accessToken } = useAuth();
  const { addItem } = useCart();
  const { itemIds, toggle } = useWishlist();
  const { toast } = useToast();

  const [product, setProduct] = useState<Product | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [related, setRelated] = useState<Product[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [activeImage, setActiveImage] = useState(0);
  const [selectedAttrs, setSelectedAttrs] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [restockSubscribed, setRestockSubscribed] = useState(false);
  const [restockSubmitting, setRestockSubmitting] = useState(false);
  const [reviewForm, setReviewForm] = useState({ rating: 5, title: "", body: "" });
  const [reviewPhoto, setReviewPhoto] = useState<File | null>(null);
  const [questionBody, setQuestionBody] = useState("");

  useEffect(() => {
    setProduct(null);
    setNotFound(false);
    setActiveImage(0);
    api
      .get<Product>(`/products/${slug}`)
      .then((p) => {
        setProduct(p);
        setRestockSubscribed(!!p.restockSubscribed);
        addRecentlyViewed(p.id);
        const firstAttrs = p.variants?.[0]?.attributes;
        if (firstAttrs) setSelectedAttrs(firstAttrs);
      })
      .catch(() => setNotFound(true));
  }, [slug]);

  useEffect(() => {
    if (!product) return;
    api.get<Review[]>(`/reviews?productId=${product.id}`).then(setReviews).catch(() => {});
    api.get<Question[]>(`/qa/questions?productId=${product.id}`).then(setQuestions).catch(() => {});
    api.get<Product[]>(`/products/${product.slug}/related`).then(setRelated).catch(() => setRelated([]));
  }, [product]);

  const attributeKeys = useMemo(() => {
    if (!product) return [];
    const keys = new Set<string>();
    product.variants.forEach((v) => Object.keys(v.attributes || {}).forEach((k) => keys.add(k)));
    return Array.from(keys);
  }, [product]);

  const selectedVariant = useMemo(() => {
    if (!product) return undefined;
    if (attributeKeys.length === 0) return product.variants[0];
    return (
      product.variants.find((v) => attributeKeys.every((k) => v.attributes[k] === selectedAttrs[k])) ??
      product.variants[0]
    );
  }, [product, attributeKeys, selectedAttrs]);

  if (notFound) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center">
        <p className="text-lg font-bold">محصول مورد نظر یافت نشد.</p>
        <Link href="/products" className="mt-4 inline-block rounded-lg bg-brand px-5 py-2 font-bold text-[#0b0e14]">
          بازگشت به محصولات
        </Link>
      </div>
    );
  }

  if (!product) return <ProductDetailSkeleton />;

  const hasDiscount = product.compareAtPrice && Number(product.compareAtPrice) > Number(product.basePrice);
  const discountPercent = hasDiscount
    ? Math.round((1 - Number(product.basePrice) / Number(product.compareAtPrice)) * 100)
    : 0;
  const isWishlisted = itemIds.has(product.id);
  const totalStock = product.totalStock ?? undefined;
  const outOfStock = totalStock !== undefined && totalStock <= 0;
  const lowStock = totalStock !== undefined && totalStock > 0 && totalStock <= 5;

  async function handleAddToCart(redirectToCheckout = false) {
    if (!user) {
      toast("برای افزودن به سبد خرید ابتدا وارد شوید.", "info");
      return;
    }
    if (outOfStock) {
      toast("این محصول در حال حاضر ناموجود است.", "error");
      return;
    }
    setSubmitting(true);
    try {
      await addItem(product!.id, quantity, selectedVariant?.id);
      toast("به سبد خرید اضافه شد.", "success");
      if (redirectToCheckout) router.push("/checkout");
    } catch {
      toast("افزودن به سبد خرید با خطا مواجه شد.", "error");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRestockToggle() {
    if (!user) {
      toast("برای دریافت اطلاع‌رسانی ابتدا وارد شوید.", "info");
      return;
    }
    setRestockSubmitting(true);
    try {
      if (restockSubscribed) {
        await api.delete(`/products/${product!.id}/notify-restock`, accessToken);
        setRestockSubscribed(false);
        toast("اطلاع‌رسانی لغو شد.", "success");
      } else {
        await api.post(`/products/${product!.id}/notify-restock`, undefined, accessToken);
        setRestockSubscribed(true);
        toast("هر وقت این کالا موجود شد، پیامک می‌گیرید.", "success");
      }
    } catch {
      toast("ثبت درخواست با خطا مواجه شد.", "error");
    } finally {
      setRestockSubmitting(false);
    }
  }

  function handleWishlist() {
    if (!user) {
      toast("برای افزودن به علاقه‌مندی‌ها ابتدا وارد شوید.", "info");
      return;
    }
    toggle(product!.id);
    toast(isWishlisted ? "از علاقه‌مندی‌ها حذف شد." : "به علاقه‌مندی‌ها اضافه شد.", "success");
  }

  async function handleReviewSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!accessToken) return;
    try {
      const review = await api.post<{ id: string }>("/reviews", { productId: product!.id, ...reviewForm }, accessToken);
      if (reviewPhoto) {
        await api.upload(`/reviews/${review.id}/images`, reviewPhoto, "file", accessToken);
      }
      setReviewForm({ rating: 5, title: "", body: "" });
      setReviewPhoto(null);
      toast("نظر شما ثبت شد و پس از تایید نمایش داده می‌شود.", "success");
    } catch {
      toast("ثبت نظر با خطا مواجه شد.", "error");
    }
  }

  async function handleQuestionSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!accessToken || !questionBody.trim()) return;
    try {
      const q = await api.post<Question>("/qa/questions", { productId: product!.id, body: questionBody }, accessToken);
      setQuestions((prev) => [{ ...q, answers: [] }, ...prev]);
      setQuestionBody("");
      toast("پرسش شما ثبت شد.", "success");
    } catch {
      toast("ثبت پرسش با خطا مواجه شد.", "error");
    }
  }

  const images = product.images?.length ? product.images : [];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="grid gap-8 md:grid-cols-2">
        <div>
          <div className="aspect-square overflow-hidden rounded-2xl surface-card">
            {images[activeImage] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={images[activeImage].url}
                alt={product.name}
                className={`h-full w-full object-cover ${outOfStock ? "opacity-50 grayscale" : ""}`}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-foreground/40">بدون تصویر</div>
            )}
          </div>
          {images.length > 1 && (
            <div className="mt-3 flex gap-2 overflow-x-auto no-scrollbar">
              {images.map((img, i) => (
                <button
                  key={img.id}
                  onClick={() => setActiveImage(i)}
                  className={`h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg border-2 transition-colors ${
                    i === activeImage ? "border-brand" : "border-transparent opacity-70 hover:opacity-100"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.url} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="flex items-start justify-between gap-3">
            <div>
              {product.brand && <p className="text-sm text-foreground/50">{product.brand.name}</p>}
              <h1 className="mt-1 text-2xl font-bold">{product.name}</h1>
            </div>
            <button
              onClick={handleWishlist}
              aria-label="افزودن به علاقه‌مندی‌ها"
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full surface-card text-foreground/70 transition-colors hover:text-brand"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill={isWishlisted ? "#F5B82E" : "none"} stroke="currentColor" strokeWidth="1.8">
                <path d="M12 20.5s-7.5-4.6-9.9-9.2C.5 7.9 2 4.5 5.4 3.7c2-.5 3.9.3 5 1.9a.7.7 0 0 0 1.2 0c1.1-1.6 3-2.4 5-1.9 3.4.8 4.9 4.2 3.3 7.6-2.4 4.6-9.9 9.2-9.9 9.2Z" />
              </svg>
            </button>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-3">
            {!!product.avgRating && (
              <div className="flex items-center gap-1 text-sm">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="#F5B82E">
                  <path d="m12 2 2.9 6.6 7.1.7-5.4 4.7 1.6 7-6.2-3.7L5.8 21l1.6-7L2 9.3l7.1-.7L12 2Z" />
                </svg>
                <span className="font-bold">{product.avgRating.toFixed(1)}</span>
                <span className="text-foreground/50">({(product.reviewCount ?? 0).toLocaleString("fa-IR")} نظر)</span>
              </div>
            )}
            {totalStock !== undefined && (
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                  outOfStock ? "bg-surface-2 text-foreground/50" : lowStock ? "bg-brand/10 text-brand" : "bg-emerald-500/10 text-emerald-400"
                }`}
              >
                {outOfStock ? "ناموجود" : lowStock ? `تنها ${totalStock.toLocaleString("fa-IR")} عدد باقی مانده` : "موجود در انبار"}
              </span>
            )}
          </div>

          <div className="mt-4 flex items-baseline gap-2">
            <p className="text-2xl font-extrabold text-brand">{formatToman(product.basePrice)}</p>
            {hasDiscount && (
              <>
                <p className="text-sm text-foreground/50 line-through">{formatToman(product.compareAtPrice!)}</p>
                <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-bold text-brand">٪{discountPercent}−</span>
              </>
            )}
          </div>
          {product.minWholesaleQty && (
            <p className="mt-1 text-xs text-foreground/50">
              خرید عمده از {product.minWholesaleQty} عدد با قیمت ویژه محاسبه می‌شود.
            </p>
          )}
          {product.description && <p className="mt-4 text-sm leading-7 text-foreground/80">{product.description}</p>}

          {attributeKeys.length > 0 && (
            <div className="mt-6 space-y-3">
              {attributeKeys.map((key) => {
                const values = Array.from(new Set(product.variants.map((v) => v.attributes[key]).filter(Boolean)));
                return (
                  <div key={key}>
                    <p className="mb-1.5 text-xs font-medium text-foreground/60">{key}</p>
                    <div className="flex flex-wrap gap-2">
                      {values.map((val) => (
                        <button
                          key={val}
                          onClick={() => setSelectedAttrs((prev) => ({ ...prev, [key]: val }))}
                          className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                            selectedAttrs[key] === val
                              ? "border-brand bg-brand/10 text-brand"
                              : "border-border-color text-foreground/70 hover:border-brand/50"
                          }`}
                        >
                          {val}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
              className="w-20 rounded-lg border border-border-color bg-background px-2 py-2.5 text-center"
            />
            <button
              onClick={() => handleAddToCart(false)}
              disabled={submitting || outOfStock}
              className="rounded-lg bg-surface-2 border border-border-color px-5 py-2.5 font-bold text-foreground transition hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:opacity-50"
            >
              افزودن به سبد خرید
            </button>
            <button
              onClick={() => handleAddToCart(true)}
              disabled={submitting || outOfStock}
              className="rounded-lg bg-brand px-5 py-2.5 font-bold text-[#0b0e14] shadow-lg shadow-brand/20 transition-shadow hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50"
            >
              خرید فوری
            </button>
          </div>

          {outOfStock && (
            <button
              onClick={handleRestockToggle}
              disabled={restockSubmitting}
              className={`mt-3 rounded-lg border px-5 py-2.5 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                restockSubscribed
                  ? "border-brand bg-brand/10 text-brand"
                  : "border-border-color text-foreground/70 hover:border-brand hover:text-brand"
              }`}
            >
              {restockSubscribed ? "اطلاع‌رسانی فعال است — لغو" : "اطلاع بده وقتی موجود شد"}
            </button>
          )}
        </div>
      </div>

      <section className="mt-8 sm:mt-12">
        <h2 className="mb-4 text-lg font-bold">نظرات کاربران</h2>
        <div className="space-y-3">
          {reviews.length === 0 && <p className="text-sm text-foreground/50">هنوز نظری ثبت نشده است.</p>}
          {reviews.map((r) => (
            <div key={r.id} className="rounded-lg border border-border-color p-3 text-sm">
              <div className="font-bold">{"⭐".repeat(r.rating)}</div>
              {r.title && <p className="mt-1 font-medium">{r.title}</p>}
              {r.body && <p className="mt-1 text-foreground/70">{r.body}</p>}
              {r.images.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {r.images.map((img) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={img.id} src={img.url} alt="" className="h-16 w-16 rounded-lg border border-border-color object-cover" />
                  ))}
                </div>
              )}
              <p className="mt-1 text-xs text-foreground/40">{r.user.fullName ?? "کاربر"}</p>
            </div>
          ))}
        </div>
        {user && (
          <form onSubmit={handleReviewSubmit} className="mt-4 space-y-2 rounded-lg border border-border-color p-3">
            <select
              value={reviewForm.rating}
              onChange={(e) => setReviewForm({ ...reviewForm, rating: Number(e.target.value) })}
              className="rounded-lg border border-border-color bg-background px-2 py-1"
            >
              {[5, 4, 3, 2, 1].map((n) => (
                <option key={n} value={n}>
                  {n} ستاره
                </option>
              ))}
            </select>
            <input
              placeholder="عنوان (اختیاری)"
              value={reviewForm.title}
              onChange={(e) => setReviewForm({ ...reviewForm, title: e.target.value })}
              className="w-full rounded-lg border border-border-color bg-background px-2 py-1"
            />
            <textarea
              placeholder="متن نظر شما"
              value={reviewForm.body}
              onChange={(e) => setReviewForm({ ...reviewForm, body: e.target.value })}
              className="w-full rounded-lg border border-border-color bg-background px-2 py-1"
            />
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => setReviewPhoto(e.target.files?.[0] ?? null)}
              className="w-full text-xs text-foreground/60"
            />
            <button type="submit" className="rounded-lg bg-brand px-4 py-1.5 text-sm font-bold text-[#0b0e14]">
              ثبت نظر
            </button>
          </form>
        )}
      </section>

      <section className="mt-8 sm:mt-12">
        <h2 className="mb-4 text-lg font-bold">پرسش و پاسخ</h2>
        <div className="space-y-3">
          {questions.length === 0 && <p className="text-sm text-foreground/50">هنوز پرسشی ثبت نشده است.</p>}
          {questions.map((q) => (
            <div key={q.id} className="rounded-lg border border-border-color p-3 text-sm">
              <p className="font-medium">{q.body}</p>
              {q.answers.map((a) => (
                <p key={a.id} className="mt-2 mr-4 text-foreground/70">
                  {a.isFromStaff && <span className="ml-1 rounded bg-brand/10 px-1 text-xs text-brand">پاسخ فروشگاه</span>}
                  {a.body}
                </p>
              ))}
            </div>
          ))}
        </div>
        {user && (
          <form onSubmit={handleQuestionSubmit} className="mt-4 flex gap-2">
            <input
              placeholder="پرسش خود را بنویسید"
              value={questionBody}
              onChange={(e) => setQuestionBody(e.target.value)}
              className="flex-1 rounded-lg border border-border-color bg-background px-2 py-1"
            />
            <button type="submit" className="rounded-lg bg-brand px-4 py-1.5 text-sm font-bold text-[#0b0e14]">
              ارسال
            </button>
          </form>
        )}
      </section>

      {related.length > 0 && (
        <section className="mt-8 sm:mt-14">
          <h2 className="mb-6 text-lg font-bold">
            محصولات <span className="gradient-text">مرتبط</span>
          </h2>
          <ProductGrid products={related} />
        </section>
      )}

      <RecentlyViewed excludeProductId={product.id} />
    </div>
  );
}
