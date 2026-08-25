"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCart } from "@/context/CartContext";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";

function formatToman(value: number) {
  return `${value.toLocaleString("fa-IR")} تومان`;
}

function CartSkeleton() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="skeleton mb-6 h-8 w-32 rounded" />
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-20 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}

export default function CartPage() {
  const { cart, loading, updateItem, removeItem } = useCart();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const router = useRouter();

  if (authLoading) {
    return <CartSkeleton />;
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="text-foreground/70">برای مشاهده سبد خرید ابتدا وارد شوید.</p>
        <Link href="/login" className="mt-4 inline-block rounded-lg bg-brand px-5 py-2 font-bold text-[#0b0e14]">
          ورود / ثبت‌نام
        </Link>
      </div>
    );
  }

  if (loading && !cart) {
    return <CartSkeleton />;
  }

  if (!cart || cart.items.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="text-foreground/60">سبد خرید شما خالی است.</p>
        <Link href="/products" className="mt-4 inline-block rounded-lg bg-brand px-5 py-2 font-bold text-[#0b0e14]">
          مشاهده محصولات
        </Link>
      </div>
    );
  }

  async function handleQuantityChange(itemId: string, quantity: number) {
    if (quantity < 1) return;
    try {
      await updateItem(itemId, quantity);
    } catch {
      toast("به‌روزرسانی تعداد با خطا مواجه شد.", "error");
    }
  }

  async function handleRemove(itemId: string) {
    try {
      await removeItem(itemId);
      toast("از سبد خرید حذف شد.", "success");
    } catch {
      toast("حذف با خطا مواجه شد.", "error");
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold">سبد خرید</h1>
      <div className="space-y-3">
        {cart.items.map((item) => (
          <div key={item.id} className="flex items-center gap-4 rounded-xl surface-card p-3">
            <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg bg-surface-2">
              {item.product.images?.[0]?.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.product.images[0].url} alt={item.product.name} className="h-full w-full object-cover" />
              ) : null}
            </div>
            <div className="flex-1">
              <p className="font-medium">{item.product.name}</p>
              <p className="text-sm text-foreground/50">{formatToman(item.unitPrice)}</p>
            </div>
            <input
              type="number"
              min={1}
              value={item.quantity}
              onChange={(e) => handleQuantityChange(item.id, Number(e.target.value))}
              className="w-16 rounded-lg border border-border-color bg-background px-2 py-1 text-center"
            />
            <p className="w-28 text-left font-bold text-brand">{formatToman(item.lineTotal)}</p>
            <button onClick={() => handleRemove(item.id)} className="text-red-400 transition hover:text-red-300" aria-label="حذف">
              حذف
            </button>
          </div>
        ))}
      </div>

      <div className="mt-6 flex items-center justify-between rounded-xl surface-card p-4">
        <span className="font-bold">جمع کل</span>
        <span className="text-xl font-extrabold text-brand">{formatToman(cart.subtotal)}</span>
      </div>

      <button
        onClick={() => router.push("/checkout")}
        className="mt-4 w-full rounded-xl bg-brand py-3 font-bold text-[#0b0e14] shadow-lg shadow-brand/20 transition-shadow hover:shadow-xl"
      >
        ادامه فرآیند خرید
      </button>
    </div>
  );
}
