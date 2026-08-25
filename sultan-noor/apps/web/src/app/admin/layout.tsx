"use client";

import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import NotificationBell from "@/components/NotificationBell";

const STAFF_ROLES = ["SUPER_ADMIN", "ADMIN", "STAFF", "WAREHOUSE_MANAGER"];

// Every AI-related page, grouped under one collapsible "AI" menu item in the
// sidebar instead of being scattered as separate top-level links.
const AI_NAV = [
  { href: "/admin/ai-control-center", label: "مرکز کنترل AI" },
  { href: "/admin/owner-report", label: "گزارش هوشمند امروز" },
  { href: "/admin/approval-center", label: "کارهای آماده تأیید" },
  { href: "/admin/inventory", label: "پیش‌بینی موجودی" },
  { href: "/admin/crm", label: "مشتریان (CRM)" },
  { href: "/admin/ai-products", label: "آماده‌سازی محصول با AI" },
  { href: "/admin/seo", label: "سئو خودکار" },
  { href: "/admin/content", label: "تولید محتوا با AI" },
  { href: "/admin/news", label: "اخبار برق (AI)" },
  { href: "/admin/sales-recommendations", label: "پیشنهادهای فروش AI" },
];

const NAV = [
  { href: "/admin", label: "داشبورد" },
  { href: "/admin/analytics", label: "گزارش پیشرفته فروش" },
  { href: "/admin/products", label: "محصولات" },
  { href: "/admin/scene-hotspots", label: "نقاط تعاملی سه‌بعدی" },
  { href: "/admin/consultant-rules", label: "قوانین مشاور هوشمند برق" },
  { href: "/admin/sales-analytics", label: "تحلیل فروش" },
  { href: "/admin/orders", label: "سفارش‌ها" },
  { href: "/admin/returns", label: "مرجوعی‌ها" },
  { href: "/admin/wholesale-leads", label: "درخواست‌های عمده‌فروشی" },
  { href: "/admin/support-chats", label: "پشتیبانی زنده" },
  { href: "/admin/categories", label: "دسته‌بندی‌ها" },
  { href: "/admin/brands", label: "برندها" },
  { href: "/admin/banners", label: "بنرها" },
  { href: "/admin/warehouses", label: "انبارها" },
  { href: "/admin/suppliers", label: "تامین‌کنندگان" },
  { href: "/admin/pricing", label: "قیمت‌گذاری" },
  { href: "/admin/shipping", label: "نرخ ارسال" },
  { href: "/admin/reviews", label: "نظرات" },
  { href: "/admin/qa", label: "پرسش و پاسخ" },
  { href: "/admin/blog", label: "وبلاگ" },
  { href: "/admin/users", label: "کاربران" },
  { href: "/admin/audit-logs", label: "لاگ فعالیت" },
  { href: "/admin/settings", label: "تنظیمات" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();

  if (loading) return <div className="p-8 text-center">در حال بارگذاری...</div>;

  if (!user || !STAFF_ROLES.includes(user.role)) {
    return <div className="p-8 text-center text-red-500">شما به این بخش دسترسی ندارید.</div>;
  }

  return (
    <div className="mx-auto flex max-w-6xl gap-6 px-4 py-8">
      <aside className="w-48 shrink-0 space-y-1">
        <Link href="/admin" className="block rounded-lg px-3 py-2 text-sm hover:bg-surface">
          داشبورد
        </Link>

        <details className="rounded-lg" open>
          <summary className="cursor-pointer rounded-lg px-3 py-2 text-sm font-bold text-brand hover:bg-surface">
            🤖 هوش مصنوعی (AI)
          </summary>
          <div className="mr-2 mt-1 space-y-1 border-r-2 border-brand/20 pr-2">
            {AI_NAV.map((item) => (
              <Link key={item.href} href={item.href} className="block rounded-lg px-3 py-2 text-sm hover:bg-surface">
                {item.label}
              </Link>
            ))}
          </div>
        </details>

        {NAV.slice(1).map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="block rounded-lg px-3 py-2 text-sm hover:bg-surface"
          >
            {item.label}
          </Link>
        ))}
        <button
          onClick={logout}
          className="block w-full rounded-lg px-3 py-2 text-start text-sm text-foreground/70 hover:bg-surface hover:text-red-400"
        >
          خروج از حساب
        </button>
      </aside>
      <div className="flex-1">
        <div className="mb-4 flex justify-end">
          <NotificationBell />
        </div>
        {children}
      </div>
    </div>
  );
}
