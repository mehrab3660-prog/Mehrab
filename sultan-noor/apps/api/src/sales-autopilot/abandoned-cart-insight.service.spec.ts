import { AbandonedCartInsightService } from './abandoned-cart-insight.service';

describe('AbandonedCartInsightService', () => {
  let prisma: any;
  let service: AbandonedCartInsightService;

  beforeEach(() => {
    prisma = { cart: { findMany: jest.fn().mockResolvedValue([]) } };
    service = new AbandonedCartInsightService(prisma);
  });

  it('computes real approximate value and frequent products from real cart/item rows, never a guess', async () => {
    prisma.cart.findMany.mockResolvedValue([
      {
        id: 'c1',
        updatedAt: new Date('2026-08-01'),
        abandonedReminderSentAt: null,
        items: [
          { productId: 'p1', product: { id: 'p1', name: 'لامپ LED' }, quantity: 2, productVariant: { price: 50_000 } },
          { productId: 'p2', product: { id: 'p2', name: 'سرپیچ' }, quantity: 1, productVariant: { price: 20_000 } },
        ],
      },
      {
        id: 'c2',
        updatedAt: new Date('2026-08-02'),
        abandonedReminderSentAt: new Date(),
        items: [{ productId: 'p1', product: { id: 'p1', name: 'لامپ LED' }, quantity: 1, productVariant: { price: 50_000 } }],
      },
    ]);

    const result = await service.summary();

    expect(result.count).toBe(2);
    expect(result.approximateValueToman).toBe(2 * 50_000 + 20_000 + 50_000);
    expect(result.frequentProducts[0]).toEqual({ productId: 'p1', name: 'لامپ LED', count: 3 });
    expect(result.carts[1]).toEqual(expect.objectContaining({ id: 'c2', reminderAlreadySent: true }));
  });

  it('reuses the exact same "abandoned" window CartRecoveryService uses (3h-7d untouched, has real items)', async () => {
    await service.summary();

    const where = prisma.cart.findMany.mock.calls[0][0].where;
    expect(where.items).toEqual({ some: {} });
    expect(where.updatedAt.lte).toBeInstanceOf(Date);
    expect(where.updatedAt.gte).toBeInstanceOf(Date);
    const gapMs = where.updatedAt.lte.getTime() - where.updatedAt.gte.getTime();
    expect(Math.round(gapMs / (60 * 60 * 1000))).toBe(7 * 24 - 3); // 7 days minus 3 hours
  });

  it('reports zero, not fabricated data, when there are no real abandoned carts', async () => {
    const result = await service.summary();
    expect(result).toEqual({ count: 0, approximateValueToman: 0, frequentProducts: [], oldestAbandonedAt: null, carts: [] });
  });
});
