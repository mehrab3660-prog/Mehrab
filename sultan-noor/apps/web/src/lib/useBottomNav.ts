"use client";

import { usePathname } from "next/navigation";

// Pages with their own sticky/full-screen CTA or a dense form flow, where a
// fixed bottom nav would compete with the primary action or eat scarce
// vertical space.
const HIDDEN_PREFIXES = ["/checkout", "/login", "/admin"];

export function useBottomNavVisible() {
  const pathname = usePathname();
  return !HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
