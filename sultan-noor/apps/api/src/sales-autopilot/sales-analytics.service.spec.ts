import { SalesAnalyticsService } from './sales-analytics.service';

function order(overrides: Partial<Record<string, unknown>> = {}) {
  return { id: 'o1', createdAt: new Date(), grandTotal: 100_000, status: 'DELIVERED', ...overrides };
}

describe('SalesAnalyticsService', () => {
  let prisma: any;
  let service: SalesAnalyticsService;

  beforeEach(() => {
    prisma = {
      order: { findMany: jest.fn().mockResolvedValue([]) },
      orderItem: { groupBy: jest.fn().mockResolvedValue([]), findMany: jest.fn().mockResolvedValue([]) },
      product: { findMany: jest.fn().mockResolvedValue([]) },
    };
    service = new SalesAnalyticsService(prisma);
  });

  describe('overview', () => {
    it('always reports dataGaps for KPIs with no real backing data (view/search tracking) rather than fabricating them', async () => {
      const result = await service.overview();

      expect(result.dataGaps.length).toBeGreaterThan(0);
      expect(result.dataGaps.some((g: string) => g.includes('نرخ تبدیل'))).toBe(true);
      expect(result.dataGaps.some((g: string) => g.includes('جستجو'))).toBe(true);
    });

    it('never queries orders with PENDING_PAYMENT/CANCELLED/REFUNDED status for revenue figures', async () => {
      await service.overview();

      for (const call of prisma.order.findMany.mock.calls) {
        const statusFilter = call[0]?.where?.status?.in;
        if (statusFilter) {
          expect(statusFilter).toEqual(['PROCESSING', 'SHIPPED', 'DELIVERED']);
        }
      }
    });
  });

  describe('weekOverWeek', () => {
    it('reports comparisonAvailable=false and null change percentages when last week has no real orders', async () => {
      prisma.order.findMany.mockResolvedValue([]);

      const result = await service.weekOverWeek();

      expect(result.comparisonAvailable).toBe(false);
      expect(result.revenueChangePercent).toBeNull();
      expect(result.orderCountChangePercent).toBeNull();
    });

    it('computes a real revenue/order-count change percent from two real, equal-length 7-day windows', async () => {
      const now = new Date();
      const day = 24 * 60 * 60 * 1000;
      prisma.order.findMany.mockImplementation(async ({ where }: any) => {
        const gte: Date = where.createdAt.gte;
        // this-week window: gte = now-7d, no lte (revenueForRange passes `to` as lte)
        const isThisWeek = Math.abs(gte.getTime() - (now.getTime() - 7 * day)) < day;
        if (isThisWeek) return [order({ grandTotal: 200_000 }), order({ grandTotal: 200_000 })]; // 400,000 / 2 orders
        return [order({ grandTotal: 100_000 })]; // last week: 100,000 / 1 order
      });

      const result = await service.weekOverWeek();

      expect(result.comparisonAvailable).toBe(true);
      expect(result.thisWeek.revenue).toBe(400_000);
      expect(result.lastWeek.revenue).toBe(100_000);
      expect(result.revenueChangePercent).toBe(300); // (400k-100k)/100k = 300%
      expect(result.orderCountChangePercent).toBe(100); // (2-1)/1 = 100%
    });
  });

  describe('bestSellers / worstSellers', () => {
    it('ranks products by real revenue and quantity from real OrderItem rows', async () => {
      prisma.order.findMany.mockResolvedValue([order({ id: 'o1' })]);
      prisma.orderItem.groupBy.mockResolvedValue([
        { productId: 'p1', _sum: { quantity: 10, lineTotal: 500_000 } },
        { productId: 'p2', _sum: { quantity: 2, lineTotal: 50_000 } },
      ]);
      prisma.product.findMany.mockResolvedValue([
        { id: 'p1', name: 'محصول پرفروش', status: 'PUBLISHED' },
        { id: 'p2', name: 'محصول کم‌فروش', status: 'PUBLISHED' },
      ]);

      const best = await service.bestSellers(30, 10);
      expect(best[0]).toEqual(expect.objectContaining({ productId: 'p1', quantitySold: 10, revenue: 500_000 }));

      const worst = await service.worstSellers(30, 10);
      expect(worst[0].productId).toBe('p2');
    });

    it('drops rows for since-deleted products instead of showing fabricated names', async () => {
      prisma.order.findMany.mockResolvedValue([order({ id: 'o1' })]);
      prisma.orderItem.groupBy.mockResolvedValue([{ productId: 'gone', _sum: { quantity: 3, lineTotal: 30_000 } }]);
      prisma.product.findMany.mockResolvedValue([]); // product no longer exists

      const best = await service.bestSellers(30, 10);
      expect(best).toEqual([]);
    });
  });

  describe('noSalesProducts', () => {
    it('only lists PUBLISHED products with zero real sales ever', async () => {
      prisma.orderItem.findMany.mockResolvedValue([{ productId: 'p1' }]);
      prisma.product.findMany.mockResolvedValue([{ id: 'p2', name: 'بدون فروش', createdAt: new Date() }]);

      const result = await service.noSalesProducts(10);

      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ status: 'PUBLISHED', id: { notIn: ['p1'] } }) }),
      );
      expect(result).toEqual([{ productId: 'p2', name: 'بدون فروش', publishedAt: expect.any(Date) }]);
    });
  });

  describe('decliningSalesProducts', () => {
    it('flags a real, computed decline between two equal-length real windows', async () => {
      // First quantityByProduct() call = current window, second = prior window
      prisma.order.findMany
        .mockResolvedValueOnce([{ id: 'o1' }]) // current window orders
        .mockResolvedValueOnce([{ id: 'o0' }]); // prior window orders
      prisma.orderItem.findMany
        .mockResolvedValueOnce([{ productId: 'p1', quantity: 2, nameSnapshot: 'محصول' }]) // current
        .mockResolvedValueOnce([{ productId: 'p1', quantity: 10, nameSnapshot: 'محصول' }]); // prior

      const result = await service.decliningSalesProducts(30);

      expect(result).toEqual([{ productId: 'p1', name: 'محصول', currentQty: 2, priorQty: 10, declinePercent: 0.8 }]);
    });

    it('ignores products with too little prior-period volume to be meaningful', async () => {
      prisma.order.findMany.mockResolvedValueOnce([{ id: 'o1' }]).mockResolvedValueOnce([{ id: 'o0' }]);
      prisma.orderItem.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ productId: 'p1', quantity: 1, nameSnapshot: 'محصول' }]); // prior qty=1, below noise threshold

      const result = await service.decliningSalesProducts(30);
      expect(result).toEqual([]);
    });
  });
});
