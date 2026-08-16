import Link from "next/link";

const COLUMNS = [
  {
    title: "فروشگاه",
    links: [
      { href: "/products", label: "همه محصولات" },
      { href: "/blog", label: "وبلاگ" },
      { href: "/wishlist", label: "علاقه‌مندی‌ها" },
    ],
  },
  {
    title: "حساب کاربری",
    links: [
      { href: "/login", label: "ورود / ثبت‌نام" },
      { href: "/orders", label: "سفارش‌های من" },
      { href: "/cart", label: "سبد خرید" },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="relative mt-20 overflow-hidden border-t border-border-color bg-surface">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage: "radial-gradient(circle, currentColor 1.2px, transparent 1.2px)",
          backgroundSize: "20px 20px",
        }}
      />
      <div className="relative mx-auto grid max-w-6xl gap-10 px-4 py-12 text-sm sm:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <p className="text-lg font-extrabold">
            <span className="gradient-text">سلطان</span> نور
          </p>
          <p className="mt-3 max-w-xs leading-6 text-foreground/60">
            فروشگاه آنلاین B2C و B2B با پشتیبانی از قیمت‌گذاری پلکانی برای مشتریان عمده و مشاور خرید هوشمند.
          </p>
        </div>

        {COLUMNS.map((col) => (
          <div key={col.title}>
            <p className="mb-3 font-bold">{col.title}</p>
            <ul className="space-y-2 text-foreground/60">
              {col.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="transition-colors hover:text-brand">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="relative border-t border-border-color px-4 py-4 text-center text-xs text-foreground/45">
        © {new Date().getFullYear()} فروشگاه سلطان نور — تمامی حقوق محفوظ است.
      </div>
    </footer>
  );
}
