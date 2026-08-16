"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
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
  const { user, accessToken } = useAuth();
  const { cart, refresh } = useCart();
  const router = useRouter();

  const [addresses, setAddresses] = useState<Address[]>([]);
  const [addressId, setAddressId] = useState<string>("");
  const [showNewAddress, setShowNewAddress] = useState(false);
  const [newAddress, setNewAddress] = useState({
    title: "خانه",
    province: "",
    city: "",
    line1: "",
    receiverName: "",
    receiverPhone: "",
  });
  const [discountCode, setDiscountCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    api.get<{ addresses: Address[] }>("/users/me", accessToken).then((me) => {
      setAddresses(me.addresses);
      if (me.addresses[0]) setAddressId(me.addresses[0].id);
      else setShowNewAddress(true);
    });
  }, [accessToken]);

  useEffect(() => {
    if (!user) router.push("/login");
  }, [user, router]);

  if (!user) return null;

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
      const payment = await api.post<{ paymentUrl: string }>("/payments/initiate", { orderId: order.id }, accessToken);
      await refresh();
      window.location.href = payment.paymentUrl;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "خطا در ثبت سفارش");
      setLoading(false);
    }
  }

  if (!cart || cart.items.length === 0) {
    return <div className="mx-auto max-w-3xl px-4 py-16 text-center text-foreground/60">سبد خرید شما خالی است.</div>;
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold">تسویه حساب</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        <section>
          <h2 className="mb-2 font-bold">آدرس تحویل</h2>
          {addresses.length > 0 && !showNewAddress && (
            <div className="space-y-2">
              {addresses.map((a) => (
                <label key={a.id} className="flex items-center gap-2 rounded-lg border border-border-color p-3 text-sm">
                  <input type="radio" checked={addressId === a.id} onChange={() => setAddressId(a.id)} />
                  {a.title} — {a.province}، {a.city}، {a.line1}
                </label>
              ))}
              <button type="button" onClick={() => setShowNewAddress(true)} className="text-sm text-brand">
                + افزودن آدرس جدید
              </button>
            </div>
          )}
          {showNewAddress && (
            <div className="grid grid-cols-2 gap-2">
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
                  className="rounded-lg border border-border-color bg-background px-3 py-2 text-sm"
                />
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-2 font-bold">کد تخفیف</h2>
          <input
            value={discountCode}
            onChange={(e) => setDiscountCode(e.target.value)}
            placeholder="کد تخفیف (اختیاری)"
            className="w-full rounded-lg border border-border-color bg-background px-3 py-2 text-sm"
          />
        </section>

        <div className="flex items-center justify-between rounded-lg bg-surface p-4">
          <span className="font-bold">جمع کل سبد خرید</span>
          <span className="text-xl font-extrabold text-brand">{formatToman(cart.subtotal)}</span>
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <button disabled={loading} className="w-full rounded-lg bg-brand py-3 font-bold text-[#0b0e14]">
          {loading ? "در حال انتقال به درگاه پرداخت..." : "پرداخت و ثبت سفارش"}
        </button>
      </form>
    </div>
  );
}
