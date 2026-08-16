"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { ShippingRate } from "@/lib/types";

function formatToman(value: string | number) {
  return `${Number(value).toLocaleString("fa-IR")} تومان`;
}

export default function AdminShippingPage() {
  const { accessToken } = useAuth();
  const { toast } = useToast();

  const [rates, setRates] = useState<ShippingRate[] | null>(null);
  const [form, setForm] = useState({ province: "", maxWeightGrams: "", price: "" });

  function load() {
    if (!accessToken) return;
    api.get<ShippingRate[]>("/shipping/rates", accessToken).then(setRates);
  }

  useEffect(load, [accessToken]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.post(
        "/shipping/rates",
        {
          province: form.province.trim() || undefined,
          maxWeightGrams: Number(form.maxWeightGrams),
          price: Number(form.price),
        },
        accessToken,
      );
      setForm({ province: "", maxWeightGrams: "", price: "" });
      toast("نرخ ارسال ثبت شد.", "success");
      load();
    } catch {
      toast("ثبت نرخ ارسال با خطا مواجه شد.", "error");
    }
  }

  async function handleRemove(id: string) {
    try {
      await api.delete(`/shipping/rates/${id}`, accessToken);
      toast("نرخ ارسال حذف شد.", "success");
      load();
    } catch {
      toast("حذف نرخ ارسال با خطا مواجه شد.", "error");
    }
  }

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold">نرخ‌های ارسال</h1>
      <p className="mb-6 text-sm text-foreground/50">
        برای هر استان، سقف وزن (گرم) و هزینه‌ی متناظر را تعریف کنید. سطر بدون استان به‌عنوان نرخ پیش‌فرض برای سایر استان‌ها
        استفاده می‌شود. در صورت نبود هیچ نرخی، هزینه‌ی ثابت پیش‌فرض اعمال می‌شود.
      </p>

      <form onSubmit={handleCreate} className="mb-6 flex flex-wrap gap-2">
        <input
          placeholder="استان (خالی = پیش‌فرض)"
          value={form.province}
          onChange={(e) => setForm({ ...form, province: e.target.value })}
          className="rounded-lg border border-border-color bg-background px-2 py-1 text-sm"
        />
        <input
          required
          type="number"
          placeholder="سقف وزن (گرم)"
          value={form.maxWeightGrams}
          onChange={(e) => setForm({ ...form, maxWeightGrams: e.target.value })}
          className="w-36 rounded-lg border border-border-color bg-background px-2 py-1 text-sm"
        />
        <input
          required
          type="number"
          placeholder="هزینه (تومان)"
          value={form.price}
          onChange={(e) => setForm({ ...form, price: e.target.value })}
          className="w-36 rounded-lg border border-border-color bg-background px-2 py-1 text-sm"
        />
        <button className="rounded-lg bg-brand px-3 py-1 text-sm text-[#0b0e14]">افزودن</button>
      </form>

      {rates === null ? (
        <p className="text-sm text-foreground/50">در حال بارگذاری...</p>
      ) : rates.length === 0 ? (
        <p className="text-sm text-foreground/50">هنوز نرخ ارسالی ثبت نشده — هزینه‌ی ثابت پیش‌فرض اعمال می‌شود.</p>
      ) : (
        <ul className="space-y-1">
          {rates.map((r) => (
            <li key={r.id} className="flex items-center justify-between rounded-lg border border-border-color p-2 text-sm">
              <span>
                {r.province ?? "پیش‌فرض (سایر استان‌ها)"} — تا {r.maxWeightGrams.toLocaleString("fa-IR")} گرم —{" "}
                {formatToman(r.price)}
              </span>
              <button onClick={() => handleRemove(r.id)} className="text-xs text-red-500">
                حذف
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
