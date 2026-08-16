"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCart } from "@/context/CartContext";
import { useAuth } from "@/context/AuthContext";

function formatToman(value: number) {
  return `${value.toLocaleString("fa-IR")} تومان`;
}

export default function CartPage() {
  const { cart, updateItem, removeItem } = useCart();
  const { user } = useAuth();
  const router = useRouter();

  if (!user) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p>برای مشاهده سبد خرید ابتدا وارد شوید.</p>
        <Link href="/login" className="mt-4 inline-block rounded-lg bg-brand px-5 py-2 text-[#0b0e14]">
          ورود / ثبت‌نام
        </Link>
      </div>
    );
  }

  if (!cart || cart.items.length === 0) {
    return <div className="mx-auto max-w-3xl px-4 py-16 text-center text-foreground/60">سبد خرید شما خالی است.</div>;
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold">سبد خرید</h1>
      <div className="space-y-3">
        {cart.items.map((item) => (
          <div key={item.id} className="flex items-center gap-4 rounded-lg border border-border-color p-3">
            <div className="flex-1">
              <p className="font-medium">{item.product.name}</p>
              <p className="text-sm text-foreground/50">{formatToman(item.unitPrice)}</p>
            </div>
            <input
              type="number"
              min={1}
              value={item.quantity}
              onChange={(e) => updateItem(item.id, Number(e.target.value))}
              className="w-16 rounded-lg border border-border-color bg-background px-2 py-1 text-center"
            />
            <p className="w-28 text-left font-bold">{formatToman(item.lineTotal)}</p>
            <button onClick={() => removeItem(item.id)} className="text-red-500">
              حذف
            </button>
          </div>
        ))}
      </div>

      <div className="mt-6 flex items-center justify-between rounded-lg bg-surface p-4">
        <span className="font-bold">جمع کل</span>
        <span className="text-xl font-extrabold text-brand">{formatToman(cart.subtotal)}</span>
      </div>

      <button
        onClick={() => router.push("/checkout")}
        className="mt-4 w-full rounded-lg bg-brand py-3 font-bold text-[#0b0e14]"
      >
        ادامه فرآیند خرید
      </button>
    </div>
  );
}
