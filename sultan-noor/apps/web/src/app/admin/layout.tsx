"use client";

import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import NotificationBell from "@/components/NotificationBell";

const STAFF_ROLES = ["SUPER_ADMIN", "ADMIN", "STAFF", "WAREHOUSE_MANAGER"];

const NAV = [
  { href: "/admin", label: "داشبورد" },
  { href: "/admin/analytics", label: "گزارش پیشرفته فروش" },
  { href: "/admin/products", label: "محصولات" },
  { href: "/admin/ai-products", label: "آماده‌سازی محصول با AI" },
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
        {NAV.map((item) => (
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
