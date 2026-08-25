"use client";

import { useBottomNavVisible } from "@/lib/useBottomNav";

export default function MainContent({ children }: { children: React.ReactNode }) {
  const bottomNavVisible = useBottomNavVisible();
  return <main className={`flex-1 ${bottomNavVisible ? "pb-16 sm:pb-0" : ""}`}>{children}</main>;
}
