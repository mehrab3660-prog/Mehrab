import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { Banner, Product } from "@/lib/types";
import ProductCard from "@/components/ProductCard";

async function safeGet<T>(path: string, fallback: T): Promise<T> {
  try {
    return await apiFetch<T>(path);
  } catch {
    return fallback;
  }
}

export default async function HomePage() {
  const [banners, productsRes] = await Promise.all([
    safeGet<Banner[]>("/banners?placement=HOME_HERO", []),
    safeGet<{ items: Product[] }>("/products?take=8", { items: [] }),
  ]);

  const hero = banners[0];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <section className="overflow-hidden rounded-2xl bg-gradient-to-l from-brand to-brand-dark p-10 text-white">
        <h1 className="text-3xl font-extrabold">{hero?.title ?? "به فروشگاه سلطان نور خوش آمدید"}</h1>
        <p className="mt-3 max-w-xl text-white/90">
          خرید محصولات روشنایی با بهترین کیفیت — برای مصرف‌کنندگان و همچنین قیمت‌گذاری ویژه عمده‌فروشان.
        </p>
        <Link href="/products" className="mt-6 inline-block rounded-lg bg-white px-5 py-2 font-bold text-brand-dark">
          مشاهده محصولات
        </Link>
      </section>

      <section className="mt-12">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold">محصولات پیشنهادی</h2>
          <Link href="/products" className="text-sm text-brand">
            مشاهده همه
          </Link>
        </div>
        {productsRes.items.length === 0 ? (
          <p className="text-foreground/60">
            هنوز محصولی ثبت نشده است. برای شروع، از پنل مدیریت محصول اضافه کنید یا دستور <code>pnpm seed</code> را در
            <code> apps/api</code> اجرا کنید.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {productsRes.items.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
