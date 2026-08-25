import { ConsultantItemKey, ConsultantTier } from './electrical-calculators';

// A real, currently-published product+variant the caller already hydrated
// from the DB (price/stock always current) — this module never fetches
// anything itself, so it can be unit-tested with zero mocking.
export interface CandidateProduct {
  id: string;
  variantId: string;
  name: string;
  slug: string;
  brandId: string | null;
  brandName: string | null;
  price: number;
  stock: number;
}

export interface ItemRequirement {
  itemKey: ConsultantItemKey;
  label: string;
  quantity: number;
  minQuantity: number;
  maxQuantity: number | null;
  priorityBrandIds: string[]; // ordered, most-preferred first
}

export interface PackageLine {
  itemKey: ConsultantItemKey;
  label: string;
  productId: string;
  productName: string;
  slug: string;
  brandName: string | null;
  variantId: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  reason: string;
  requestedQuantity: number;
}

export function clampQuantity(requested: number, min: number, max: number | null): number {
  let quantity = Math.max(requested, min);
  if (max != null) quantity = Math.min(quantity, max);
  return Math.max(0, quantity);
}

// Picks which real candidate best represents a given package tier. Always
// returns a real candidate from the list (or null) — never fabricates one.
export function selectCandidateForTier(candidates: CandidateProduct[], tier: ConsultantTier, priorityBrandIds: string[]): CandidateProduct | null {
  if (candidates.length === 0) return null;
  const byPriceAsc = [...candidates].sort((a, b) => a.price - b.price);

  if (tier === 'ECONOMIC') return byPriceAsc[0];

  if (tier === 'PROFESSIONAL') {
    for (const brandId of priorityBrandIds) {
      const brandMatches = candidates.filter((c) => c.brandId === brandId).sort((a, b) => b.price - a.price);
      if (brandMatches.length > 0) return brandMatches[0];
    }
    return byPriceAsc[byPriceAsc.length - 1];
  }

  // STANDARD: prefer a priority-brand candidate if one exists, otherwise the
  // median-priced real candidate — a deliberate middle ground, not a guess.
  for (const brandId of priorityBrandIds) {
    const brandMatches = candidates.filter((c) => c.brandId === brandId).sort((a, b) => a.price - b.price);
    if (brandMatches.length > 0) return brandMatches[Math.floor(brandMatches.length / 2)];
  }
  return byPriceAsc[Math.floor((byPriceAsc.length - 1) / 2)];
}

function toLine(requirement: ItemRequirement, candidate: CandidateProduct, quantity: number, reason: string): PackageLine {
  return {
    itemKey: requirement.itemKey,
    label: requirement.label,
    productId: candidate.id,
    productName: candidate.name,
    slug: candidate.slug,
    brandName: candidate.brandName,
    variantId: candidate.variantId,
    quantity,
    unitPrice: candidate.price,
    lineTotal: candidate.price * quantity,
    reason,
    requestedQuantity: requirement.quantity,
  };
}

// Builds one real, stock-validated package line for one item requirement.
// Never invents a product/price/stock: if the ideal tier pick doesn't have
// enough real stock, it substitutes the closest-priced real candidate that
// does (§6 Smart Substitute); if nothing has any stock at all, it returns
// null so the caller can omit the item honestly (§5) instead of showing a
// fake availability.
export function buildPackageLine(requirement: ItemRequirement, candidates: CandidateProduct[], tier: ConsultantTier): PackageLine | null {
  const quantity = clampQuantity(requirement.quantity, requirement.minQuantity, requirement.maxQuantity);
  if (quantity <= 0 || candidates.length === 0) return null;

  const primary = selectCandidateForTier(candidates, tier, requirement.priorityBrandIds);
  if (!primary) return null;

  const fallbackOrder = [
    primary,
    ...candidates.filter((c) => c.id !== primary.id || c.variantId !== primary.variantId).sort((a, b) => Math.abs(a.price - primary.price) - Math.abs(b.price - primary.price)),
  ];

  for (const candidate of fallbackOrder) {
    if (candidate.stock >= quantity) {
      const isPrimary = candidate.id === primary.id && candidate.variantId === primary.variantId;
      return toLine(requirement, candidate, quantity, isPrimary ? 'بهترین گزینه‌ی واقعی موجود برای این سطح' : 'جایگزین موجود سلطان نور به‌جای گزینه‌ی اصلی (موجودی کافی نبود)');
    }
  }

  // No real candidate has enough stock for the full requested quantity —
  // reduce to the largest real, currently in-stock quantity rather than
  // pretending the full amount is available.
  const bestPartial = fallbackOrder.filter((c) => c.stock > 0).sort((a, b) => b.stock - a.stock)[0];
  if (!bestPartial) return null;
  return toLine(requirement, bestPartial, bestPartial.stock, `موجودی کافی برای ${quantity} عدد نبود؛ تعداد به ${bestPartial.stock} عدد کاهش یافت`);
}
