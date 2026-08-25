"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { ConsultantItemRule } from "@/lib/types";
import AdminHelp from "@/components/admin/AdminHelp";

const EMPTY_FORM = { itemKey: "", label: "", categoryId: "", keywords: "", minQuantity: "0", maxQuantity: "", priorityBrandIds: "" };

export default function ConsultantRulesPage() {
  const { accessToken } = useAuth();
  const { toast } = useToast();
  const [rules, setRules] = useState<ConsultantItemRule[] | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  function load() {
    if (!accessToken) return;
    api.get<ConsultantItemRule[]>("/admin/consultant-rules", accessToken).then(setRules);
  }
  useEffect(load, [accessToken]);

  async function handleCreate() {
    if (!form.itemKey.trim() || !form.label.trim()) return;
    setSaving(true);
    try {
      await api.post(
        "/admin/consultant-rules",
        {
          itemKey: form.itemKey.trim().toUpperCase(),
          label: form.label.trim(),
          categoryId: form.categoryId || undefined,
          keywords: form.keywords || undefined,
          minQuantity: Number(form.minQuantity) || 0,
          maxQuantity: form.maxQuantity ? Number(form.maxQuantity) : undefined,
          priorityBrandIds: form.priorityBrandIds || undefined,
        },
        accessToken,
      );
      toast("قانون محاسبه ذخیره شد.", "success");
      setForm(EMPTY_FORM);
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "ذخیره قانون با خطا مواجه شد.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(rule: ConsultantItemRule) {
    try {
      await api.patch(`/admin/consultant-rules/${rule.id}`, { isActive: !rule.isActive }, accessToken);
      load();
    } catch {
      toast("تغییر وضعیت با خطا مواجه شد.", "error");
    }
  }

  async function remove(rule: ConsultantItemRule) {
    try {
      await api.delete(`/admin/consultant-rules/${rule.id}`, accessToken);
      toast("قانون حذف شد.", "success");
      load();
    } catch {
      toast("حذف قانون با خطا مواجه شد.", "error");
    }
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">قوانین محاسبه مشاور هوشمند برق</h1>

      <AdminHelp storageKey="consultant-rules">
        <p>هر «قانون محاسبه» مشخص می‌کند که برای یک نوع کالا (مثلاً کلید، پریز، لامپ) مشاور هوشمند از کدام دسته‌بندی یا کلمات کلیدی واقعی سایت، و با چه سقف/کف تعدادی، محصول پیشنهاد بدهد.</p>
        <p>اگر برای یک نوع کالا هیچ قانونی تعریف نشده باشد، مشاور آن مورد را به‌طور صادقانه از لیست پیشنهادی کنار می‌گذارد — هرگز محصولی جعل نمی‌کند.</p>
        <p>«شناسه محصولات مجاز» (اختیاری، از طریق ویرایش مستقیم API) برای مواردی که نام محصولات مشابه‌اند و جستجوی کلمه‌کلیدی کافی نیست (مثلاً «پریز» و «پریز ارت») ضروری است.</p>
      </AdminHelp>

      <div className="mb-8 rounded-lg border border-border-color p-4">
        <h2 className="mb-3 font-bold">افزودن قانون جدید</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          <input value={form.itemKey} onChange={(e) => setForm((f) => ({ ...f, itemKey: e.target.value }))} placeholder="کلید قلم (مثلاً SWITCH، LAMP)" dir="ltr" className="rounded-lg border border-border-color bg-background px-3 py-2 text-sm" />
          <input value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} placeholder="برچسب فارسی (مثلاً کلید)" className="rounded-lg border border-border-color bg-background px-3 py-2 text-sm" />
          <input value={form.categoryId} onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))} placeholder="Category ID واقعی (اختیاری)" dir="ltr" className="rounded-lg border border-border-color bg-background px-3 py-2 text-sm" />
          <input value={form.keywords} onChange={(e) => setForm((f) => ({ ...f, keywords: e.target.value }))} placeholder="کلمات کلیدی جستجو (با کاما جدا شود)" className="rounded-lg border border-border-color bg-background px-3 py-2 text-sm" />
          <input type="number" value={form.minQuantity} onChange={(e) => setForm((f) => ({ ...f, minQuantity: e.target.value }))} placeholder="حداقل تعداد" className="rounded-lg border border-border-color bg-background px-3 py-2 text-sm" />
          <input type="number" value={form.maxQuantity} onChange={(e) => setForm((f) => ({ ...f, maxQuantity: e.target.value }))} placeholder="حداکثر تعداد (اختیاری)" className="rounded-lg border border-border-color bg-background px-3 py-2 text-sm" />
          <input value={form.priorityBrandIds} onChange={(e) => setForm((f) => ({ ...f, priorityBrandIds: e.target.value }))} placeholder="Brand IDهای اولویت‌دار (با کاما، برای سطح حرفه‌ای)" dir="ltr" className="rounded-lg border border-border-color bg-background px-3 py-2 text-sm sm:col-span-2" />
        </div>
        <button onClick={handleCreate} disabled={saving} className="mt-3 rounded-lg bg-brand px-4 py-2 text-sm font-bold text-[#0b0e14] disabled:opacity-50">
          {saving ? "در حال ذخیره..." : "افزودن قانون"}
        </button>
      </div>

      {rules === null ? (
        <p className="text-sm text-foreground/50">در حال بارگذاری...</p>
      ) : rules.length === 0 ? (
        <p className="text-sm text-foreground/50">هنوز قانونی تعریف نشده — تا وقتی قانونی برای یک نوع کالا نباشد، آن مورد در پیشنهادها نمی‌آید.</p>
      ) : (
        <div className="space-y-2">
          {rules.map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-lg border border-border-color p-3 text-sm">
              <div>
                <p>
                  <span className="font-mono text-xs text-foreground/40" dir="ltr">{r.itemKey}</span>{" "}
                  <span className="font-bold">{r.label}</span>
                </p>
                <p className="text-xs text-foreground/40">
                  {r.categoryId ? `دسته: ${r.categoryId}` : "بدون دسته"} — {r.keywords ? `کلمات: ${r.keywords}` : "بدون کلمه کلیدی"} — تعداد: {r.minQuantity} تا {r.maxQuantity ?? "∞"}
                  {r.allowedProductIdsJson && ` — ${r.allowedProductIdsJson.length} محصول مجاز مشخص`}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button onClick={() => toggleActive(r)} className={`rounded-lg border px-2 py-1 text-xs ${r.isActive ? "border-green-500/40 text-green-500" : "border-border-color text-foreground/50"}`}>
                  {r.isActive ? "فعال" : "غیرفعال"}
                </button>
                <button onClick={() => remove(r)} className="rounded-lg border border-red-500/40 px-2 py-1 text-xs text-red-500">
                  حذف
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
