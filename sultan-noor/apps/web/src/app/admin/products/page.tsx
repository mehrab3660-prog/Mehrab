"use client";

import { Fragment, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Product, Brand, Category, Supplier } from "@/lib/types";
import AdminHelp from "@/components/admin/AdminHelp";

interface Warehouse {
  id: string;
  name: string;
}

const STATUS_LABEL: Record<Product["status"], string> = {
  DRAFT: "پیش‌نویس",
  PUBLISHED: "منتشرشده",
  ARCHIVED: "بایگانی‌شده",
};

interface EditForm {
  name: string;
  slug: string;
  description: string;
  status: Product["status"];
  brandId: string;
  categoryId: string;
  supplierId: string;
  basePrice: string;
  compareAtPrice: string;
  minWholesaleQty: string;
  model3dUrl: string;
}

function editFormFromProduct(p: Product): EditForm {
  return {
    name: p.name,
    slug: p.slug,
    description: p.description ?? "",
    status: p.status,
    brandId: p.brand?.id ?? "",
    categoryId: p.category?.id ?? "",
    supplierId: p.supplierId ?? "",
    basePrice: String(p.basePrice),
    compareAtPrice: p.compareAtPrice != null ? String(p.compareAtPrice) : "",
    minWholesaleQty: p.minWholesaleQty != null ? String(p.minWholesaleQty) : "",
    model3dUrl: p.model3dUrl ?? "",
  };
}

interface BulkImportResult {
  totalRows: number;
  created: number;
  failed: number;
  errors: { row: number; message: string }[];
}

interface BulkImageImportResult {
  totalFiles: number;
  matched: number;
  unmatched: string[];
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
  const [brands, setBrands] = useState<Brand[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [importWarehouseId, setImportWarehouseId] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<BulkImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [imageZipFile, setImageZipFile] = useState<File | null>(null);
  const [importingImages, setImportingImages] = useState(false);
  const [imageImportResult, setImageImportResult] = useState<BulkImageImportResult | null>(null);
  const [imageImportError, setImageImportError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);

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
    if (accessToken) {
      api.get<Warehouse[]>("/warehouses", accessToken).then(setWarehouses).catch(() => {});
      api.get<Brand[]>("/brands").then(setBrands).catch(() => {});
      api.get<Category[]>("/categories").then(setCategories).catch(() => {});
      api.get<Supplier[]>("/suppliers", accessToken).then(setSuppliers).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  function startEdit(p: Product) {
    setEditingId(p.id);
    setEditForm(editFormFromProduct(p));
    setEditError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm(null);
    setEditError(null);
  }

  async function handleEditSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId || !editForm) return;
    setEditSaving(true);
    setEditError(null);
    try {
      await api.patch(
        `/products/${editingId}`,
        {
          name: editForm.name,
          slug: editForm.slug,
          description: editForm.description || undefined,
          status: editForm.status,
          brandId: editForm.brandId || undefined,
          categoryId: editForm.categoryId || undefined,
          supplierId: editForm.supplierId || undefined,
          basePrice: Number(editForm.basePrice),
          compareAtPrice: editForm.compareAtPrice ? Number(editForm.compareAtPrice) : undefined,
          minWholesaleQty: editForm.minWholesaleQty ? Number(editForm.minWholesaleQty) : undefined,
          model3dUrl: editForm.model3dUrl || undefined,
        },
        accessToken,
      );
      cancelEdit();
      load();
    } catch (err) {
      setEditError(err instanceof ApiError ? err.message : "خطا در ذخیره‌ی تغییرات");
    } finally {
      setEditSaving(false);
    }
  }

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

  async function handleBulkImageImport(e: React.FormEvent) {
    e.preventDefault();
    if (!imageZipFile) return;
    setImportingImages(true);
    setImageImportError(null);
    setImageImportResult(null);
    try {
      const result = await api.upload<BulkImageImportResult>("/products/bulk-images", imageZipFile, "file", accessToken);
      setImageImportResult(result);
      setImageZipFile(null);
      load();
    } catch (err) {
      setImageImportError(err instanceof ApiError ? err.message : "خطا در وارد کردن فایل ZIP");
    } finally {
      setImportingImages(false);
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

      <AdminHelp storageKey="products">
        <p>برای افزودن یک محصول تکی، فرم بالای جدول را پر کنید و «افزودن محصول» را بزنید. بعد از ساختن محصول می‌توانید از ستون «عکس‌ها» برای آن عکس اضافه کنید (روی «+» کلیک کنید).</p>
        <p>اگر تعداد محصولات زیاد است، به‌جای وارد کردن یک‌به‌یک، از بخش «ورود گروهی محصولات» استفاده کنید: اول «دانلود قالب نمونه» را بزنید، فایل اکسل/CSV خودتان را طبق همان قالب پر کنید، سپس آن را انتخاب و «وارد کردن» را بزنید.</p>
        <p>ستون‌های name (نام)، slug (آدرس انگلیسی صفحه) و sku (کد محصول) در فایل ورود گروهی الزامی هستند. اگر ستون basePrice (قیمت پایه) را برای یک ردیف خالی بگذارید، آن محصول به‌صورت «پیش‌نویس» (پنهان از مشتری) ساخته می‌شود تا بعداً خودتان قیمتش را وارد و منتشرش کنید.</p>
        <p>اگر نام برند یا دسته‌بندی‌ای در فایل بنویسید که هنوز در سایت وجود ندارد، خودکار ساخته می‌شود.</p>
        <p>برای وصل کردن عکس به چند محصول هم‌زمان (به‌جای یکی‌یکی)، از بخش «ورود گروهی عکس محصولات» استفاده کنید: چند عکس را با نام‌گذاری بر اساس کد محصول (SKU) در یک فایل ZIP بریزید و آن را انتخاب کنید.</p>
        <p>برای تغییر مشخصات یک محصول (نام، قیمت، برند، دسته‌بندی، توضیحات و غیره)، روی «ویرایش» در انتهای همان ردیف بزنید.</p>
        <p>برای حذف یک محصول، روی «حذف» در انتهای همان ردیف بزنید. این کار قابل بازگشت نیست.</p>
      </AdminHelp>

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
          ستون‌های name، slug و sku الزامی هستند؛ basePrice اگر خالی باشد، محصول به‌صورت پیش‌نویس (بدون قیمت) ساخته می‌شود. هر
          ردیف یک محصول با یک گزینه (variant) می‌سازد؛ برای افزودن گزینه‌های بیشتر بعداً از همین صفحه استفاده کنید.
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

      <form onSubmit={handleBulkImageImport} className="mb-8 space-y-3 rounded-lg border border-border-color p-4">
        <h2 className="font-bold">ورود گروهی عکس محصولات (فایل ZIP)</h2>
        <p className="text-xs text-foreground/50">
          یک فایل ZIP از عکس‌ها انتخاب کنید. نام هر عکس (بدون پسوند) باید دقیقاً همان کد محصول (SKU) باشد — مثلاً عکس محصولی
          با کد AT09 باید در فایل ZIP به اسم AT09.jpg باشد. هر عکس با کد مطابق، خودکار به همان محصول وصل می‌شود.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input type="file" accept=".zip" onChange={(e) => setImageZipFile(e.target.files?.[0] ?? null)} className="text-sm" />
          <button
            disabled={!imageZipFile || importingImages}
            className="rounded-lg bg-brand px-3 py-1 text-sm font-bold text-[#0b0e14] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {importingImages ? "در حال وارد کردن..." : "وارد کردن"}
          </button>
        </div>
        {imageImportError && <p className="text-sm text-red-500">{imageImportError}</p>}
        {imageImportResult && (
          <div className="rounded-lg bg-background p-3 text-sm">
            <p>
              از {imageImportResult.totalFiles.toLocaleString("fa-IR")} عکس،{" "}
              <span className="font-bold text-emerald-400">{imageImportResult.matched.toLocaleString("fa-IR")}</span> به محصول
              مربوطه وصل شد
              {imageImportResult.unmatched.length > 0 && (
                <>
                  {" و "}
                  <span className="font-bold text-red-400">{imageImportResult.unmatched.length.toLocaleString("fa-IR")}</span>{" "}
                  عکس با هیچ کد محصولی مطابقت نداشت.
                </>
              )}
              {imageImportResult.unmatched.length === 0 && "."}
            </p>
            {imageImportResult.unmatched.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs text-foreground/60">
                {imageImportResult.unmatched.map((name, i) => (
                  <li key={i}>{name}</li>
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
            <Fragment key={p.id}>
              <tr className="border-b border-border-color">
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
                <td className="p-2">{STATUS_LABEL[p.status]}</td>
                <td className="p-2">{Number(p.basePrice).toLocaleString("fa-IR")} تومان</td>
                <td className="p-2">
                  <div className="flex gap-3">
                    <button onClick={() => (editingId === p.id ? cancelEdit() : startEdit(p))} className="text-brand">
                      {editingId === p.id ? "انصراف" : "ویرایش"}
                    </button>
                    <button onClick={() => handleDelete(p.id)} className="text-red-500">
                      حذف
                    </button>
                  </div>
                </td>
              </tr>
              {editingId === p.id && editForm && (
                <tr className="border-b border-border-color bg-surface">
                  <td colSpan={5} className="p-3">
                    <form onSubmit={handleEditSave} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <input
                        required
                        placeholder="نام محصول"
                        value={editForm.name}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        className="rounded-lg border border-border-color bg-background px-2 py-1 text-sm"
                      />
                      <input
                        required
                        placeholder="اسلاگ (انگلیسی)"
                        value={editForm.slug}
                        onChange={(e) => setEditForm({ ...editForm, slug: e.target.value })}
                        className="rounded-lg border border-border-color bg-background px-2 py-1 text-sm"
                      />
                      <input
                        required
                        type="number"
                        placeholder="قیمت پایه (تومان)"
                        value={editForm.basePrice}
                        onChange={(e) => setEditForm({ ...editForm, basePrice: e.target.value })}
                        className="rounded-lg border border-border-color bg-background px-2 py-1 text-sm"
                      />
                      <input
                        type="number"
                        placeholder="قیمت قبل از تخفیف (اختیاری)"
                        value={editForm.compareAtPrice}
                        onChange={(e) => setEditForm({ ...editForm, compareAtPrice: e.target.value })}
                        className="rounded-lg border border-border-color bg-background px-2 py-1 text-sm"
                      />
                      <select
                        value={editForm.status}
                        onChange={(e) => setEditForm({ ...editForm, status: e.target.value as Product["status"] })}
                        className="rounded-lg border border-border-color bg-background px-2 py-1 text-sm"
                      >
                        {(Object.keys(STATUS_LABEL) as Product["status"][]).map((s) => (
                          <option key={s} value={s}>
                            {STATUS_LABEL[s]}
                          </option>
                        ))}
                      </select>
                      <select
                        value={editForm.brandId}
                        onChange={(e) => setEditForm({ ...editForm, brandId: e.target.value })}
                        className="rounded-lg border border-border-color bg-background px-2 py-1 text-sm"
                      >
                        <option value="">بدون برند</option>
                        {brands.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name}
                          </option>
                        ))}
                      </select>
                      <select
                        value={editForm.categoryId}
                        onChange={(e) => setEditForm({ ...editForm, categoryId: e.target.value })}
                        className="rounded-lg border border-border-color bg-background px-2 py-1 text-sm"
                      >
                        <option value="">بدون دسته‌بندی</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      <select
                        value={editForm.supplierId}
                        onChange={(e) => setEditForm({ ...editForm, supplierId: e.target.value })}
                        className="rounded-lg border border-border-color bg-background px-2 py-1 text-sm"
                      >
                        <option value="">بدون تامین‌کننده</option>
                        {suppliers.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        placeholder="حداقل تعداد خرید عمده (اختیاری)"
                        value={editForm.minWholesaleQty}
                        onChange={(e) => setEditForm({ ...editForm, minWholesaleQty: e.target.value })}
                        className="rounded-lg border border-border-color bg-background px-2 py-1 text-sm"
                      />
                      <input
                        type="text"
                        placeholder="آدرس مدل سه‌بعدی GLB (اختیاری — برای نمایشگر ۳بعدی صفحه محصول)"
                        value={editForm.model3dUrl}
                        onChange={(e) => setEditForm({ ...editForm, model3dUrl: e.target.value })}
                        className="col-span-2 rounded-lg border border-border-color bg-background px-2 py-1 text-sm sm:col-span-4"
                      />
                      <textarea
                        placeholder="توضیحات محصول (اختیاری)"
                        value={editForm.description}
                        onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                        rows={2}
                        className="col-span-2 rounded-lg border border-border-color bg-background px-2 py-1 text-sm sm:col-span-4"
                      />
                      <div className="col-span-2 flex gap-2 sm:col-span-4">
                        <button disabled={editSaving} className="rounded-lg bg-brand px-3 py-1.5 text-sm font-bold text-[#0b0e14] disabled:opacity-50">
                          {editSaving ? "در حال ذخیره..." : "ذخیره تغییرات"}
                        </button>
                        <button type="button" onClick={cancelEdit} className="rounded-lg border border-border-color px-3 py-1.5 text-sm">
                          انصراف
                        </button>
                      </div>
                      {editError && <p className="col-span-2 text-sm text-red-500 sm:col-span-4">{editError}</p>}
                    </form>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
