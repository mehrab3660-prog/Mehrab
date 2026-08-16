"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import { useToast } from "@/context/ToastContext";
import { api, ApiError } from "@/lib/api";

interface Address {
  id: string;
  title: string;
  province: string;
  city: string;
  line1: string;
  receiverName: string;
  receiverPhone: string;
}

function formatToman(value: number) {
  return `${value.toLocaleString("fa-IR")} تومان`;
}

export default function CheckoutPage() {
  const { user, accessToken, loading: authLoading } = useAuth();
  const { cart, refresh } = useCart();
  const { toast } = useToast();
  const router = useRouter();

  const [addresses, setAddresses] = useState<Address[]>([]);
  const [addressId, setAddressId] = useState<string>("");
  const [showNewAddress, setShowNewAddress] = useState(false);
  const [addressesLoaded, setAddressesLoaded] = useState(false);
  const [newAddress, setNewAddress] = useState({
    title: "خانه",
    province: "",
    city: "",
    line1: "",
    receiverName: "",
    receiverPhone: "",
  });
  const [discountCode, setDiscountCode] = useState("");
  const [suggestedCode, setSuggestedCode] = useState<{ code: string; amount: number } | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"ZARINPAL" | "IDPAY" | "CASH_ON_DELIVERY">("ZARINPAL");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    api
      .get<{ addresses: Address[] }>("/users/me", accessToken)
      .then((me) => {
        setAddresses(me.addresses);
        if (me.addresses[0]) setAddressId(me.addresses[0].id);
        else setShowNewAddress(true);
      })
      .finally(() => setAddressesLoaded(true));
  }, [accessToken]);

  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!accessToken) return;
    api
      .get<{ code: string; amount: number } | null>("/cart/suggested-discount", accessToken)
      .then(setSuggestedCode)
      .catch(() => setSuggestedCode(null));
  }, [accessToken]);

  if (authLoading || !user) return null;

  async function ensureAddress(): Promise<string> {
    if (!showNewAddress && addressId) return addressId;
    const created = await api.post<Address>("/addresses", newAddress, accessToken);
    return created.id;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const finalAddressId = await ensureAddress();
      const order = await api.post<{ id: string }>(
        "/orders",
        { addressId: finalAddressId, discountCode: discountCode || undefined },
        accessToken,
      );
      const payment = await api.post<{ paymentUrl: string | null }>(
        "/payments/initiate",
        { orderId: order.id, gateway: paymentMethod },
        accessToken,
      );
      await refresh();
      if (payment.paymentUrl) {
        window.location.href = payment.paymentUrl;
      } else {
        toast("سفارش با پرداخت در محل ثبت شد.", "success");
        router.push(`/orders/${order.id}`);
      }
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "خطا در ثبت سفارش";
      setError(msg);
      toast(msg, "error");
      setLoading(false);
    }
  }

  if (!cart || cart.items.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="text-foreground/60">سبد خرید شما خالی است.</p>
      </div>
    );
  }

  const orderSummary = (
    <div className="rounded-2xl surface-card p-4 sm:p-5 lg:sticky lg:top-24">
      <h2 className="mb-3 font-bold">خلاصه سفارش</h2>
      <div className="max-h-64 space-y-2 overflow-y-auto no-scrollbar">
        {cart.items.map((item) => (
          <div key={item.id} className="flex items-center justify-between gap-2 text-sm">
            <span className="line-clamp-1 text-foreground/80">
              {item.product.name} <span className="text-foreground/40">×{item.quantity.toLocaleString("fa-IR")}</span>
            </span>
            <span className="flex-shrink-0 font-medium">{formatToman(item.lineTotal)}</span>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-border-color pt-4">
        <span className="font-bold">جمع کل</span>
        <span className="text-xl font-extrabold text-brand">{formatToman(cart.subtotal)}</span>
      </div>
    </div>
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold">تسویه حساب</h1>

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr] lg:items-start">
        <form onSubmit={handleSubmit} className="order-2 space-y-6 lg:order-1">
          <section className="rounded-2xl surface-card p-4 sm:p-5">
            <h2 className="mb-3 font-bold">آدرس تحویل</h2>
            {!addressesLoaded && (
              <div className="space-y-2">
                <div className="skeleton h-12 w-full rounded-lg" />
                <div className="skeleton h-12 w-full rounded-lg" />
              </div>
            )}
            {addressesLoaded && addresses.length > 0 && !showNewAddress && (
              <div className="space-y-2">
                {addresses.map((a) => (
                  <label
                    key={a.id}
                    className={`flex min-h-11 items-center gap-3 rounded-lg border p-3.5 text-sm transition-colors ${
                      addressId === a.id ? "border-brand bg-brand/5" : "border-border-color"
                    }`}
                  >
                    <input type="radio" checked={addressId === a.id} onChange={() => setAddressId(a.id)} className="h-4 w-4 flex-shrink-0 accent-[#F5B82E]" />
                    {a.title} — {a.province}، {a.city}، {a.line1}
                  </label>
                ))}
                <button type="button" onClick={() => setShowNewAddress(true)} className="min-h-11 px-1 text-sm font-medium text-brand">
                  + افزودن آدرس جدید
                </button>
              </div>
            )}
            {addressesLoaded && showNewAddress && (
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {(
                  [
                    ["title", "عنوان آدرس"],
                    ["receiverName", "نام گیرنده"],
                    ["receiverPhone", "موبایل گیرنده"],
                    ["province", "استان"],
                    ["city", "شهر"],
                    ["line1", "آدرس کامل"],
                  ] as const
                ).map(([key, label]) => (
                  <input
                    key={key}
                    required
                    placeholder={label}
                    value={newAddress[key]}
                    onChange={(e) => setNewAddress({ ...newAddress, [key]: e.target.value })}
                    className="min-h-11 rounded-lg border border-border-color bg-background px-3 py-2.5 text-sm focus:border-brand focus:outline-none"
                  />
                ))}
                {addresses.length > 0 && (
                  <button type="button" onClick={() => setShowNewAddress(false)} className="col-span-full min-h-11 py-1 text-right text-xs text-foreground/50">
                    انصراف و انتخاب از آدرس‌های ثبت‌شده
                  </button>
                )}
              </div>
            )}
          </section>

          <section className="rounded-2xl surface-card p-4 sm:p-5">
            <h2 className="mb-3 font-bold">کد تخفیف</h2>
            {suggestedCode && suggestedCode.code !== discountCode && (
              <button
                type="button"
                onClick={() => setDiscountCode(suggestedCode.code)}
                className="mb-3 w-full rounded-lg border border-brand/40 bg-brand/10 px-3 py-2.5 text-start text-sm text-brand"
              >
                کد <span className="font-bold">{suggestedCode.code}</span> برای شما فعال است — {formatToman(suggestedCode.amount)} تخفیف بگیرید
              </button>
            )}
            <input
              value={discountCode}
              onChange={(e) => setDiscountCode(e.target.value)}
              placeholder="کد تخفیف (اختیاری)"
              className="min-h-11 w-full rounded-lg border border-border-color bg-background px-3 py-2.5 text-sm focus:border-brand focus:outline-none"
            />
          </section>

          <section className="rounded-2xl surface-card p-4 sm:p-5">
            <h2 className="mb-3 font-bold">روش پرداخت</h2>
            <div className="space-y-2">
              <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-border-color px-3 py-2.5 text-sm has-[:checked]:border-brand has-[:checked]:bg-brand/10">
                <input
                  type="radio"
                  name="paymentMethod"
                  checked={paymentMethod === "ZARINPAL"}
                  onChange={() => setPaymentMethod("ZARINPAL")}
                />
                پرداخت آنلاین (زرین‌پال)
              </label>
              <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-border-color px-3 py-2.5 text-sm has-[:checked]:border-brand has-[:checked]:bg-brand/10">
                <input
                  type="radio"
                  name="paymentMethod"
                  checked={paymentMethod === "IDPAY"}
                  onChange={() => setPaymentMethod("IDPAY")}
                />
                پرداخت آنلاین (آی‌دی‌پی)
              </label>
              <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-border-color px-3 py-2.5 text-sm has-[:checked]:border-brand has-[:checked]:bg-brand/10">
                <input
                  type="radio"
                  name="paymentMethod"
                  checked={paymentMethod === "CASH_ON_DELIVERY"}
                  onChange={() => setPaymentMethod("CASH_ON_DELIVERY")}
                />
                پرداخت در محل (نقدی)
              </label>
            </div>
          </section>

          {/* order summary inline on mobile, hidden here on desktop where the sticky column handles it */}
          <div className="lg:hidden">{orderSummary}</div>

          {/* sticky on mobile so the pay action is always reachable without covering other content; a normal in-flow block on desktop */}
          <div
            className="sticky bottom-0 z-10 -mx-4 border-t border-border-color bg-background/95 px-4 pt-3 backdrop-blur-md lg:static lg:z-auto lg:mx-0 lg:border-0 lg:bg-transparent lg:px-0 lg:pt-0 lg:backdrop-blur-none"
            style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
          >
            {error && <p className="mb-2 text-sm text-red-400">{error}</p>}
            <button
              disabled={loading}
              className="w-full rounded-xl bg-brand py-3.5 font-bold text-[#0b0e14] shadow-lg shadow-brand/20 transition-shadow hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading
                ? paymentMethod === "CASH_ON_DELIVERY"
                  ? "در حال ثبت سفارش..."
                  : "در حال انتقال به درگاه پرداخت..."
                : paymentMethod === "CASH_ON_DELIVERY"
                  ? "ثبت سفارش با پرداخت در محل"
                  : "پرداخت و ثبت سفارش"}
            </button>
          </div>
        </form>

        <div className="order-1 hidden lg:order-2 lg:block">{orderSummary}</div>
      </div>
    </div>
  );
}
