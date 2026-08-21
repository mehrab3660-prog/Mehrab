import { buildPackageLine, CandidateProduct, clampQuantity, ItemRequirement, selectCandidateForTier } from './package-builder';

function candidate(overrides: Partial<CandidateProduct> = {}): CandidateProduct {
  return {
    id: 'p1',
    variantId: 'v1',
    name: 'کلید تک‌پل',
    slug: 'key-1',
    brandId: 'b1',
    brandName: 'برند ۱',
    price: 50_000,
    stock: 100,
    ...overrides,
  };
}

function requirement(overrides: Partial<ItemRequirement> = {}): ItemRequirement {
  return {
    itemKey: 'SWITCH',
    label: 'کلید',
    quantity: 10,
    minQuantity: 0,
    maxQuantity: null,
    priorityBrandIds: [],
    ...overrides,
  };
}

describe('clampQuantity', () => {
  it('never goes below the admin-configured minimum', () => {
    expect(clampQuantity(0, 2, null)).toBe(2);
  });

  it('never exceeds the admin-configured maximum', () => {
    expect(clampQuantity(50, 0, 20)).toBe(20);
  });
});

describe('selectCandidateForTier — never fabricates, only picks among real candidates', () => {
  const cheap = candidate({ id: 'cheap', price: 20_000 });
  const mid = candidate({ id: 'mid', price: 50_000 });
  const expensive = candidate({ id: 'expensive', price: 90_000, brandId: 'premium' });
  const candidates = [mid, cheap, expensive];

  it('returns null when there are literally no real candidates', () => {
    expect(selectCandidateForTier([], 'ECONOMIC', [])).toBeNull();
  });

  it('economic tier always picks the real cheapest candidate', () => {
    expect(selectCandidateForTier(candidates, 'ECONOMIC', [])).toBe(cheap);
  });

  it('professional tier picks the most expensive real match from the priority brand when one is configured', () => {
    expect(selectCandidateForTier(candidates, 'PROFESSIONAL', ['premium'])).toBe(expensive);
  });

  it('professional tier falls back to the real most expensive candidate when no priority brand matches', () => {
    expect(selectCandidateForTier(candidates, 'PROFESSIONAL', ['no-such-brand'])).toBe(expensive);
  });

  it('standard tier picks a real middle-priced candidate, not the cheapest or the priciest', () => {
    const pick = selectCandidateForTier(candidates, 'STANDARD', []);
    expect(pick).toBe(mid);
  });
});

describe('buildPackageLine — Smart Substitute (§6) and real stock validation (§5)', () => {
  it('returns null (never a fabricated line) when there are no real candidates at all', () => {
    expect(buildPackageLine(requirement(), [], 'ECONOMIC')).toBeNull();
  });

  it('builds a real, priced line from the chosen real candidate when stock is sufficient', () => {
    const line = buildPackageLine(requirement({ quantity: 5 }), [candidate({ stock: 20, price: 30_000 })], 'ECONOMIC');
    expect(line).toEqual(
      expect.objectContaining({ productId: 'p1', quantity: 5, unitPrice: 30_000, lineTotal: 150_000 }),
    );
  });

  it('substitutes the closest-priced real alternative when the ideal pick lacks stock — never invents a product', () => {
    const outOfStockPick = candidate({ id: 'primary', price: 20_000, stock: 0 });
    const realSubstitute = candidate({ id: 'substitute', price: 22_000, stock: 50 });
    const farAlternative = candidate({ id: 'far', price: 90_000, stock: 50 });

    const line = buildPackageLine(requirement({ quantity: 5 }), [outOfStockPick, realSubstitute, farAlternative], 'ECONOMIC');

    expect(line?.productId).toBe('substitute');
    expect(line?.reason).toContain('جایگزین');
  });

  it('reduces quantity to the real available stock instead of pretending the full amount exists', () => {
    const onlyCandidate = candidate({ stock: 3 });
    const line = buildPackageLine(requirement({ quantity: 10 }), [onlyCandidate], 'ECONOMIC');

    expect(line?.quantity).toBe(3);
    expect(line?.requestedQuantity).toBe(10);
    expect(line?.reason).toContain('کاهش یافت');
  });

  it('omits the item entirely (returns null) when every real candidate has zero stock — never a fake availability', () => {
    const line = buildPackageLine(requirement({ quantity: 5 }), [candidate({ stock: 0 }), candidate({ id: 'p2', stock: 0 })], 'ECONOMIC');
    expect(line).toBeNull();
  });

  it('clamps the requested quantity to the admin-configured min/max before matching stock', () => {
    const line = buildPackageLine(requirement({ quantity: 1, minQuantity: 4, maxQuantity: 6 }), [candidate({ stock: 100 })], 'ECONOMIC');
    expect(line?.quantity).toBe(4);
  });
});
