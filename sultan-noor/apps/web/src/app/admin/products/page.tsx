"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Product } from "@/lib/types";

interface Warehouse {
  id: string;
  name: string;
}

interface BulkImportResult {
  totalRows: number;
  created: number;
  failed: number;
  errors: { row: number; message: string }[];
}

const BULK_IMPORT_TEMPLATE =
  "name,slug,sku,basePrice,compareAtPrice,brand,category,price,weightGrams,quantity\n" +
  "لامپ نمونه ۹ وات,sample-led-9w,SKU-SAMPLE-1,150000,,,,,,10\n";

function downloadBulkImportTemplate() {
  const blob = new Blob(["﻿" + BULK_IMPORT_TEMPLATE], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "قالب-ورود-گروهی-محصولات.csv";
  link.click();
  URL.revokeObjectURL(url);
}

export default function AdminProductsPage() {
  const { accessToken } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [form, setForm] = useState({ name: "", slug: "", basePrice: "" });
  const [error, setError] = useState<string | null>(null);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [importWarehouseId, setImportWarehouseId] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<BulkImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  async function load() {
    if (!accessToken) return;
    const [published, drafts] = await Promise.all([
      api.get<{ items: Product[] }>("/products?status=PUBLISHED&take=100", accessToken),
      api.get<{ items: Product[] }>("/products?status=DRAFT&take=100", accessToken),
    ]);
    setProducts([...drafts.items, ...published.items]);
  }

  useEffect(() => {
    load();
    if (accessToken) api.get<Warehouse[]>("/warehouses", accessToken).then(setWarehouses).catch(() => {});
  }, [accessToken]);

  async function handleBulkImport(e: React.FormEvent) {
    e.preventDefault();
    if (!importFile) return;
    setImporting(true);
    setImportError(null);
    setImportResult(null);
    try {
      const result = await api.upload<BulkImportResult>(
        "/products/bulk-import",
        importFile,
        "file",
        accessToken,
        importWarehouseId ? { warehouseId: importWarehouseId } : undefined,
      );
      setImportResult(result);
      setImportFile(null);
      load();
    } catch (err) {
      setImportError(err instanceof ApiError ? err.message : "خطا در وارد کردن فایل");
    } finally {
      setImporting(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post(
        "/products",
        { name: form.name, slug: form.slug, basePrice: Number(form.basePrice), status: "PUBLISHED" },
        accessToken,
      );
      setForm({ name: "", slug: "", basePrice: "" });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "خطا در ایجاد محصول");
    }
  }

  async function handleDelete(id: string) {
    await api.delete(`/products/${id}`, accessToken);
    load();
  }

  async function handleUploadImage(productId: string, file: File) {
    setError(null);
    try {
      await api.upload(`/products/${productId}/images`, file, "file", accessToken);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "خطا در آپلود تصویر");
    }
  }

  async function handleDeleteImage(imageId: string) {
    await api.delete(`/products/images/${imageId}`, accessToken);
    load();
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">مدیریت محصولات</h1>

      <form onSubmit={handleCreate} className="mb-8 grid grid-cols-4 gap-2 rounded-lg border border-border-color p-4">
        <input
          required
          placeholder="نام محصول"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="rounded-lg border border-border-color bg-background px-2 py-1 text-sm"
        />
        <input
          required
          placeholder="اسلاگ (انگلیسی)"
          value={form.slug}
          onChange={(e) => setForm({ ...form, slug: e.target.value })}
          className="rounded-lg border border-border-color bg-background px-2 py-1 text-sm"
        />
        <input
          required
          type="number"
          placeholder="قیمت پایه (تومان)"
          value={form.basePrice}
          onChange={(e) => setForm({ ...form, basePrice: e.target.value })}
          className="rounded-lg border border-border-color bg-background px-2 py-1 text-sm"
        />
        <button className="rounded-lg bg-brand px-3 py-1 text-sm text-[#0b0e14]">افزودن محصول</button>
        {error && <p className="col-span-4 text-sm text-red-500">{error}</p>}
      </form>

      <form onSubmit={handleBulkImport} className="mb-8 space-y-3 rounded-lg border border-border-color p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-bold">ورود گروهی محصولات از فایل CSV یا Excel</h2>
          <button type="button" onClick={downloadBulkImportTemplate} className="text-xs text-brand hover:underline">
            دانلود قالب نمونه
          </button>
        </div>
        <p className="text-xs text-foreground/50">
          ستون‌های name، slug، sku و basePrice الزامی هستند. هر ردیف یک محصول با یک گزینه (variant) می‌سازد؛ برای
          افزودن گزینه‌های بیشتر بعداً از همین صفحه استفاده کنید.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
            className="text-sm"
          />
          <select
            value={importWarehouseId}
            onChange={(e) => setImportWarehouseId(e.target.value)}
            className="rounded-lg border border-border-color bg-background px-2 py-1 text-sm"
          >
            <option value="">بدون ثبت موجودی اولیه</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                موجودی اولیه در: {w.name}
              </option>
            ))}
          </select>
          <button
            disabled={!importFile || importing}
            className="rounded-lg bg-brand px-3 py-1 text-sm font-bold text-[#0b0e14] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {importing ? "در حال وارد کردن..." : "وارد کردن"}
          </button>
        </div>
        {importError && <p className="text-sm text-red-500">{importError}</p>}
        {importResult && (
          <div className="rounded-lg bg-background p-3 text-sm">
            <p>
              از {importResult.totalRows.toLocaleString("fa-IR")} ردیف،{" "}
              <span className="font-bold text-emerald-400">{importResult.created.toLocaleString("fa-IR")}</span> محصول
              ثبت شد
              {importResult.failed > 0 && (
                <>
                  {" و "}
                  <span className="font-bold text-red-400">{importResult.failed.toLocaleString("fa-IR")}</span> ردیف
                  با خطا مواجه شد.
                </>
              )}
              {importResult.failed === 0 && "."}
            </p>
            {importResult.errors.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs text-foreground/60">
                {importResult.errors.map((e, i) => (
                  <li key={i}>
                    ردیف {e.row.toLocaleString("fa-IR")}: {e.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </form>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border-color text-right">
            <th className="p-2">عکس‌ها</th>
            <th className="p-2">نام</th>
            <th className="p-2">وضعیت</th>
            <th className="p-2">قیمت</th>
            <th className="p-2"></th>
          </tr>
        </thead>
        <tbody>
          {products.map((p) => (
            <tr key={p.id} className="border-b border-border-color">
              <td className="p-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  {p.images.map((img) => (
                    <div key={img.id} className="group relative h-10 w-10 shrink-0 overflow-hidden rounded-md border border-border-color">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img.url} alt="" className="h-full w-full object-cover" />
                      <button
                        onClick={() => handleDeleteImage(img.id)}
                        className="absolute inset-0 hidden items-center justify-center bg-black/60 text-xs text-white group-hover:flex"
                      >
                        حذف
                      </button>
                    </div>
                  ))}
                  <label className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-md border border-dashed border-border-color text-xs text-foreground/50 hover:border-brand hover:text-brand">
                    +
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleUploadImage(p.id, file);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
              </td>
              <td className="p-2">{p.name}</td>
              <td className="p-2">{p.status}</td>
              <td className="p-2">{Number(p.basePrice).toLocaleString("fa-IR")} تومان</td>
              <td className="p-2">
                <button onClick={() => handleDelete(p.id)} className="text-red-500">
                  حذف
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
