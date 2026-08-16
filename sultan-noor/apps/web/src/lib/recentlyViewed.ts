const STORAGE_KEY = "sn_recently_viewed";
const MAX_ITEMS = 10;

export function addRecentlyViewed(productId: string) {
  if (typeof window === "undefined") return;
  const withoutCurrent = getRecentlyViewedIds().filter((id) => id !== productId);
  const updated = [productId, ...withoutCurrent].slice(0, MAX_ITEMS);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}

export function getRecentlyViewedIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
