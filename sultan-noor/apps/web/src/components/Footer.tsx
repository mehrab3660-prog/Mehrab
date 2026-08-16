"use client";

import { useState } from "react";
import Link from "next/link";
import { useBottomNavVisible } from "@/lib/useBottomNav";

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

function FooterSection({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-border-color py-1 sm:border-0 sm:py-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between py-3 text-right text-sm font-bold sm:pointer-events-none sm:py-0 sm:mb-3"
      >
        {title}
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`text-foreground/40 transition-transform sm:hidden ${open ? "rotate-180" : ""}`}
        >
          <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <div className={`overflow-hidden text-sm sm:!block sm:!h-auto ${open ? "block pb-4" : "hidden"}`}>{children}</div>
    </div>
  );
}

export default function Footer() {
  const bottomNavVisible = useBottomNavVisible();

  return (
    <footer
      className="relative mt-12 overflow-hidden border-t border-border-color bg-surface sm:mt-20 sm:!pb-0"
      style={bottomNavVisible ? { paddingBottom: "calc(5rem + env(safe-area-inset-bottom))" } : undefined}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{ backgroundImage: "radial-gradient(circle, #F5B82E 1.2px, transparent 1.2px)", backgroundSize: "20px 20px" }}
      />
      <div className="relative mx-auto max-w-6xl px-4 py-8 sm:py-12">
        {/* brand blurb — always visible, never collapsed, per "important info visible when closed" */}
        <div className="pb-5 sm:pb-0">
          <p className="text-lg font-extrabold">
            <span className="gradient-text">سلطان</span> نور
          </p>
          <p className="mt-3 max-w-xs text-sm leading-6 text-muted">
            فروشگاه تخصصی تجهیزات برق و روشنایی، با مشاور خرید هوشمند.
          </p>
        </div>

        <div className="grid gap-0 sm:mt-10 sm:grid-cols-3 sm:gap-10">
          <FooterSection title="دسترسی سریع">
            <ul className="space-y-2.5 text-muted">
              {QUICK_LINKS.map((l) => (
                <li key={l.label}>
                  <Link href={l.href} className="inline-block py-0.5 transition-colors hover:text-brand">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </FooterSection>

          <FooterSection title="خدمات مشتریان">
            <ul className="space-y-2.5 text-muted">
              {SUPPORT_LINKS.map((l) => (
                <li key={l.label}>
                  <Link href={l.href} className="inline-block py-0.5 transition-colors hover:text-brand">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </FooterSection>

          <FooterSection title="ارتباط با ما">
            <p className="leading-6 text-muted">
              اطلاعات تماس به‌زودی تکمیل می‌شود. تا آن زمان از طریق{" "}
              <Link href="/contact" className="text-brand hover:underline">
                صفحه تماس
              </Link>{" "}
              یا مشاور هوشمند در دسترس هستیم.
            </p>
          </FooterSection>
        </div>
      </div>
      <div className="relative border-t border-border-color px-4 py-4 text-center text-xs text-muted">
        © {new Date().getFullYear()} کلیه حقوق برای فروشگاه سلطان نور محفوظ است.
      </div>
    </footer>
  );
}
