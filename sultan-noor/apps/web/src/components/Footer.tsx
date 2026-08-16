import Link from "next/link";

const QUICK_LINKS = [
  { href: "/products", label: "محصولات" },
  { href: "/products", label: "تخفیف‌ها" },
  { href: "/blog", label: "وبلاگ" },
];

const SUPPORT_LINKS = [
  { href: "/orders", label: "پیگیری سفارش" },
  { href: "/contact", label: "بازگشت کالا" },
  { href: "/contact", label: "سوالات متداول" },
  { href: "/contact", label: "تماس با ما" },
];

export default function Footer() {
  return (
    <footer className="relative mt-20 overflow-hidden border-t border-border-color bg-surface pb-16 sm:pb-0">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{ backgroundImage: "radial-gradient(circle, #F5B82E 1.2px, transparent 1.2px)", backgroundSize: "20px 20px" }}
      />
      <div className="relative mx-auto grid max-w-6xl gap-10 px-4 py-12 text-sm sm:grid-cols-2 md:grid-cols-4">
        <div>
          <p className="text-lg font-extrabold">
            <span className="gradient-text">سلطان</span> نور
          </p>
          <p className="mt-3 max-w-xs leading-6 text-muted">
            فروشگاه تخصصی تجهیزات برق و روشنایی — B2C و B2B، با قیمت‌گذاری پلکانی و مشاور خرید هوشمند.
          </p>
        </div>

        <div>
          <p className="mb-3 font-bold">دسترسی سریع</p>
          <ul className="space-y-2 text-muted">
            {QUICK_LINKS.map((l) => (
              <li key={l.label}>
                <Link href={l.href} className="transition-colors hover:text-brand">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="mb-3 font-bold">خدمات مشتریان</p>
          <ul className="space-y-2 text-muted">
            {SUPPORT_LINKS.map((l) => (
              <li key={l.label}>
                <Link href={l.href} className="transition-colors hover:text-brand">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="mb-3 font-bold">ارتباط با ما</p>
          <p className="text-muted">
            اطلاعات تماس به‌زودی تکمیل می‌شود. تا آن زمان از طریق{" "}
            <Link href="/contact" className="text-brand hover:underline">
              صفحه تماس
            </Link>{" "}
            یا مشاور هوشمند در دسترس هستیم.
          </p>
        </div>
      </div>
      <div className="relative border-t border-border-color px-4 py-4 text-center text-xs text-muted">
        © {new Date().getFullYear()} کلیه حقوق برای فروشگاه سلطان نور محفوظ است.
      </div>
    </footer>
  );
}
