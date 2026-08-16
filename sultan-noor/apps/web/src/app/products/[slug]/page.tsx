"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { Product } from "@/lib/types";
import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";

interface Review {
  id: string;
  rating: number;
  title?: string | null;
  body?: string | null;
  user: { fullName: string | null };
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

export default function ProductDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const { user, accessToken } = useAuth();
  const { addItem } = useCart();

  const [product, setProduct] = useState<Product | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [message, setMessage] = useState<string | null>(null);
  const [reviewForm, setReviewForm] = useState({ rating: 5, title: "", body: "" });
  const [questionBody, setQuestionBody] = useState("");

  useEffect(() => {
    api.get<Product>(`/products/${slug}`).then(setProduct).catch(() => setProduct(null));
  }, [slug]);

  useEffect(() => {
    if (!product) return;
    api.get<Review[]>(`/reviews?productId=${product.id}`).then(setReviews).catch(() => {});
    api.get<Question[]>(`/qa/questions?productId=${product.id}`).then(setQuestions).catch(() => {});
  }, [product]);

  if (!product) return <div className="mx-auto max-w-6xl px-4 py-16 text-center">در حال بارگذاری...</div>;

  async function handleAddToCart() {
    if (!user) {
      setMessage("برای افزودن به سبد خرید ابتدا وارد شوید.");
      return;
    }
    await addItem(product!.id, quantity, product!.variants?.[0]?.id);
    setMessage("به سبد خرید اضافه شد.");
  }

  async function handleReviewSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!accessToken) return;
    await api.post("/reviews", { productId: product!.id, ...reviewForm }, accessToken);
    setReviewForm({ rating: 5, title: "", body: "" });
    setMessage("نظر شما ثبت شد و پس از تایید نمایش داده می‌شود.");
  }

  async function handleQuestionSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!accessToken || !questionBody.trim()) return;
    const q = await api.post<Question>("/qa/questions", { productId: product!.id, body: questionBody }, accessToken);
    setQuestions((prev) => [{ ...q, answers: [] }, ...prev]);
    setQuestionBody("");
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="grid gap-8 md:grid-cols-2">
        <div className="aspect-square overflow-hidden rounded-xl bg-surface-2">
          {product.images?.[0] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={product.images[0].url} alt={product.name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-foreground/40">بدون تصویر</div>
          )}
        </div>
        <div>
          {product.brand && <p className="text-sm text-foreground/50">{product.brand.name}</p>}
          <h1 className="mt-1 text-2xl font-bold">{product.name}</h1>
          {!!product.avgRating && (
            <div className="mt-2 flex items-center gap-1 text-sm">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="#F5B82E">
                <path d="m12 2 2.9 6.6 7.1.7-5.4 4.7 1.6 7-6.2-3.7L5.8 21l1.6-7L2 9.3l7.1-.7L12 2Z" />
              </svg>
              <span className="font-bold">{product.avgRating.toFixed(1)}</span>
              <span className="text-foreground/50">({(product.reviewCount ?? 0).toLocaleString("fa-IR")} نظر)</span>
            </div>
          )}
          <p className="mt-4 text-2xl font-extrabold text-brand">{formatToman(product.basePrice)}</p>
          {product.minWholesaleQty && (
            <p className="mt-1 text-xs text-foreground/50">
              خرید عمده از {product.minWholesaleQty} عدد با قیمت ویژه محاسبه می‌شود.
            </p>
          )}
          {product.description && <p className="mt-4 text-sm leading-7 text-foreground/80">{product.description}</p>}

          <div className="mt-6 flex items-center gap-3">
            <input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
              className="w-20 rounded-lg border border-border-color bg-background px-2 py-2 text-center"
            />
            <button onClick={handleAddToCart} className="rounded-lg bg-brand px-5 py-2 font-bold text-[#0b0e14]">
              افزودن به سبد خرید
            </button>
          </div>
          {message && <p className="mt-3 text-sm text-brand">{message}</p>}
        </div>
      </div>

      <section className="mt-12">
        <h2 className="mb-4 text-lg font-bold">نظرات کاربران</h2>
        <div className="space-y-3">
          {reviews.length === 0 && <p className="text-sm text-foreground/50">هنوز نظری ثبت نشده است.</p>}
          {reviews.map((r) => (
            <div key={r.id} className="rounded-lg border border-border-color p-3 text-sm">
              <div className="font-bold">{"⭐".repeat(r.rating)}</div>
              {r.title && <p className="mt-1 font-medium">{r.title}</p>}
              {r.body && <p className="mt-1 text-foreground/70">{r.body}</p>}
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
            <button type="submit" className="rounded-lg bg-brand px-4 py-1.5 text-sm text-[#0b0e14]">
              ثبت نظر
            </button>
          </form>
        )}
      </section>

      <section className="mt-12">
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
            <button type="submit" className="rounded-lg bg-brand px-4 py-1.5 text-sm text-[#0b0e14]">
              ارسال
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
