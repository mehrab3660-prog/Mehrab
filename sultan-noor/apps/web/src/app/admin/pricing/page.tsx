"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { CustomerGroup, DiscountCode, PriceTier } from "@/lib/types";
import AdminHelp from "@/components/admin/AdminHelp";

function formatToman(value: string | number) {
  return `${Number(value).toLocaleString("fa-IR")} تومان`;
}

export default function AdminPricingPage() {
  const { accessToken } = useAuth();
  const { toast } = useToast();

  const [groups, setGroups] = useState<CustomerGroup[]>([]);
  const [groupName, setGroupName] = useState("");

  const [codes, setCodes] = useState<DiscountCode[]>([]);
  const [codeForm, setCodeForm] = useState({ code: "", type: "PERCENTAGE" as "PERCENTAGE" | "FIXED_AMOUNT", value: "" });

  const [productId, setProductId] = useState("");
  const [tiers, setTiers] = useState<PriceTier[] | null>(null);
  const [tierForm, setTierForm] = useState({ customerGroupId: "", minQuantity: "", unitPrice: "" });

  function loadGroups() {
    if (!accessToken) return;
    api.get<CustomerGroup[]>("/pricing/customer-groups", accessToken).then(setGroups);
  }
  function loadCodes() {
    if (!accessToken) return;
    api.get<DiscountCode[]>("/pricing/discount-codes", accessToken).then(setCodes);
  }

  useEffect(loadGroups, [accessToken]);
  useEffect(loadCodes, [accessToken]);

  async function handleCreateGroup(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.post("/pricing/customer-groups", { name: groupName }, accessToken);
      setGroupName("");
      toast("گروه مشتری ایجاد شد.", "success");
      loadGroups();
    } catch {
      toast("ایجاد گروه مشتری با خطا مواجه شد.", "error");
    }
  }

  async function handleCreateCode(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.post("/pricing/discount-codes", { ...codeForm, value: Number(codeForm.value) }, accessToken);
      setCodeForm({ code: "", type: "PERCENTAGE", value: "" });
      toast("کد تخفیف ایجاد شد.", "success");
      loadCodes();
    } catch {
      toast("ایجاد کد تخفیف با خطا مواجه شد.", "error");
    }
  }

  async function handleDeactivateCode(id: string) {
    await api.patch(`/pricing/discount-codes/${id}/deactivate`, undefined, accessToken);
    loadCodes();
  }

  function loadTiers() {
    if (!productId) return;
    api.get<PriceTier[]>(`/pricing/price-tiers?productId=${productId}`, accessToken).then(setTiers);
  }

  async function handleUpsertTier(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.post(
        "/pricing/price-tiers",
        {
          productId,
          customerGroupId: tierForm.customerGroupId,
          minQuantity: Number(tierForm.minQuantity),
          unitPrice: Number(tierForm.unitPrice),
        },
        accessToken,
      );
      setTierForm({ customerGroupId: "", minQuantity: "", unitPrice: "" });
      toast("پلن قیمت‌گذاری ثبت شد.", "success");
      loadTiers();
    } catch {
      toast("ثبت پلن قیمت‌گذاری با خطا مواجه شد.", "error");
    }
  }

  async function handleRemoveTier(id: string) {
    await api.delete(`/pricing/price-tiers/${id}`, accessToken);
    loadTiers();
  }

  return (
    <div className="space-y-10">
      <h1 className="text-2xl font-bold">قیمت‌گذاری و تخفیف‌ها</h1>

      <AdminHelp storageKey="pricing">
        <p>«گروه‌های مشتری» برای مشتریان عمده (B2B) است؛ مثلاً می‌توانید گروه «پیمانکاران» بسازید و برای آن‌ها قیمت ویژه تعریف کنید.</p>
        <p>«کدهای تخفیف» همان کدهایی هستند که مشتری هنگام خرید در سبد خرید وارد می‌کند. نوع «درصدی» یعنی مثلاً ۱۰٪ از مبلغ کم می‌شود و «مبلغ ثابت» یعنی یک عدد مشخص (مثلاً ۵۰٬۰۰۰ تومان) کم می‌شود. برای غیرفعال کردن یک کد کافیست دکمه‌ی «غیرفعال کردن» را بزنید؛ کد حذف نمی‌شود، فقط دیگر قابل استفاده نیست.</p>
        <p>«پلن‌های قیمت‌گذاری پلکانی» یعنی تعریف قیمت ویژه برای یک محصول بر اساس تعداد خرید و گروه مشتری (مثلاً اگر گروه پیمانکاران ۱۰ عدد یا بیشتر بخرند، قیمت واحد کمتر شود). ابتدا «شناسه محصول» را وارد و «جستجو» را بزنید، سپس فرم پلن قیمت را پر کنید. برای تغییر قیمت یک پلن موجود، روی «ویرایش» همان ردیف بزنید تا فرم با مقادیرش پر شود، سپس قیمت را عوض کرده و دوباره ثبت کنید.</p>
      </AdminHelp>

      <section>
        <h2 className="mb-3 text-lg font-bold">گروه‌های مشتری (B2B)</h2>
        <form onSubmit={handleCreateGroup} className="mb-3 flex gap-2">
          <input
            required
            placeholder="نام گروه (مثلاً پیمانکاران)"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            className="rounded-lg border border-border-color bg-background px-2 py-1 text-sm"
          />
          <button className="rounded-lg bg-brand px-3 py-1 text-sm text-[#0b0e14]">افزودن</button>
        </form>
        <ul className="space-y-1">
          {groups.map((g) => (
            <li key={g.id} className="rounded-lg border border-border-color p-2 text-sm">
              {g.name}
            </li>
          ))}
          {groups.length === 0 && <p className="text-sm text-foreground/50">هنوز گروه مشتری‌ای ثبت نشده است.</p>}
        </ul>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold">کدهای تخفیف</h2>
        <form onSubmit={handleCreateCode} className="mb-3 flex flex-wrap gap-2">
          <input
            required
            placeholder="کد (مثلاً SUMMER10)"
            value={codeForm.code}
            onChange={(e) => setCodeForm({ ...codeForm, code: e.target.value })}
            className="rounded-lg border border-border-color bg-background px-2 py-1 text-sm"
          />
          <select
            value={codeForm.type}
            onChange={(e) => setCodeForm({ ...codeForm, type: e.target.value as "PERCENTAGE" | "FIXED_AMOUNT" })}
            className="rounded-lg border border-border-color bg-background px-2 py-1 text-sm"
          >
            <option value="PERCENTAGE">درصدی</option>
            <option value="FIXED_AMOUNT">مبلغ ثابت</option>
          </select>
          <input
            required
            type="number"
            placeholder={codeForm.type === "PERCENTAGE" ? "درصد تخفیف" : "مبلغ (تومان)"}
            value={codeForm.value}
            onChange={(e) => setCodeForm({ ...codeForm, value: e.target.value })}
            className="w-32 rounded-lg border border-border-color bg-background px-2 py-1 text-sm"
          />
          <button className="rounded-lg bg-brand px-3 py-1 text-sm text-[#0b0e14]">ایجاد کد</button>
        </form>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-color text-right">
              <th className="p-2">کد</th>
              <th className="p-2">نوع</th>
              <th className="p-2">مقدار</th>
              <th className="p-2">مصرف‌شده</th>
              <th className="p-2">وضعیت</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {codes.map((c) => (
              <tr key={c.id} className="border-b border-border-color">
                <td className="p-2 font-mono">{c.code}</td>
                <td className="p-2">{c.type === "PERCENTAGE" ? "درصدی" : "مبلغ ثابت"}</td>
                <td className="p-2">{c.type === "PERCENTAGE" ? `٪${c.value}` : formatToman(c.value)}</td>
                <td className="p-2">{c.usedCount.toLocaleString("fa-IR")}</td>
                <td className="p-2">{c.isActive ? "فعال" : "غیرفعال"}</td>
                <td className="p-2">
                  {c.isActive && (
                    <button onClick={() => handleDeactivateCode(c.id)} className="text-red-500">
                      غیرفعال کردن
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {codes.length === 0 && <p className="mt-2 text-sm text-foreground/50">هنوز کد تخفیفی ثبت نشده است.</p>}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold">پلن‌های قیمت‌گذاری پلکانی (بر اساس محصول)</h2>
        <div className="mb-3 flex gap-2">
          <input
            placeholder="شناسه محصول (Product ID)"
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            className="rounded-lg border border-border-color bg-background px-2 py-1 text-sm"
          />
          <button onClick={loadTiers} className="rounded-lg border border-border-color px-3 py-1 text-sm">
            جستجو
          </button>
        </div>

        {tiers !== null && (
          <>
            <form onSubmit={handleUpsertTier} className="mb-3 flex flex-wrap gap-2">
              <select
                required
                value={tierForm.customerGroupId}
                onChange={(e) => setTierForm({ ...tierForm, customerGroupId: e.target.value })}
                className="rounded-lg border border-border-color bg-background px-2 py-1 text-sm"
              >
                <option value="" disabled>
                  گروه مشتری
                </option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
              <input
                required
                type="number"
                placeholder="حداقل تعداد"
                value={tierForm.minQuantity}
                onChange={(e) => setTierForm({ ...tierForm, minQuantity: e.target.value })}
                className="w-28 rounded-lg border border-border-color bg-background px-2 py-1 text-sm"
              />
              <input
                required
                type="number"
                placeholder="قیمت واحد (تومان)"
                value={tierForm.unitPrice}
                onChange={(e) => setTierForm({ ...tierForm, unitPrice: e.target.value })}
                className="w-36 rounded-lg border border-border-color bg-background px-2 py-1 text-sm"
              />
              <button className="rounded-lg bg-brand px-3 py-1 text-sm text-[#0b0e14]">
                {tierForm.customerGroupId && tiers.some((t) => t.customerGroupId === tierForm.customerGroupId && String(t.minQuantity) === tierForm.minQuantity)
                  ? "ذخیره تغییر قیمت"
                  : "ثبت پلن"}
              </button>
            </form>

            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-color text-right">
                  <th className="p-2">گروه مشتری</th>
                  <th className="p-2">حداقل تعداد</th>
                  <th className="p-2">قیمت واحد</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {tiers.map((t) => (
                  <tr key={t.id} className="border-b border-border-color">
                    <td className="p-2">{t.customerGroup?.name ?? t.customerGroupId}</td>
                    <td className="p-2">{t.minQuantity.toLocaleString("fa-IR")}</td>
                    <td className="p-2">{formatToman(t.unitPrice)}</td>
                    <td className="p-2">
                      <div className="flex gap-3">
                        <button
                          onClick={() =>
                            setTierForm({
                              customerGroupId: t.customerGroupId,
                              minQuantity: String(t.minQuantity),
                              unitPrice: String(t.unitPrice),
                            })
                          }
                          className="text-brand"
                        >
                          ویرایش
                        </button>
                        <button onClick={() => handleRemoveTier(t.id)} className="text-red-500">
                          حذف
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {tiers.length === 0 && <p className="mt-2 text-sm text-foreground/50">هنوز پلنی برای این محصول ثبت نشده است.</p>}
          </>
        )}
      </section>
    </div>
  );
}
