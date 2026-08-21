import { NotFoundException } from '@nestjs/common';
import { CustomerInsightsService } from './customer-insights.service';

describe('CustomerInsightsService — real data only, honest prediction gating (§4/§16)', () => {
  let prisma: any;
  let segmentation: any;
  let service: CustomerInsightsService;

  beforeEach(() => {
    prisma = {
      order: { findMany: jest.fn().mockResolvedValue([]) },
      orderItem: { findMany: jest.fn().mockResolvedValue([]) },
    };
    segmentation = { summaryFor: jest.fn() };
    service = new CustomerInsightsService(prisma, segmentation);
  });

  it('throws NotFoundException for a customer with no real summary (never fabricates one)', async () => {
    segmentation.summaryFor.mockResolvedValue(null);
    await expect(service.insightsFor('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('never offers a next-purchase estimate below MIN_ORDERS_FOR_PREDICTION, and says so honestly', async () => {
    const now = new Date();
    const day = 24 * 60 * 60 * 1000;
    segmentation.summaryFor.mockResolvedValue({
      userId: 'u1', fullName: 'کاربر', phone: '0912', customerType: 'RETAIL',
      orderCount: 2, totalSpend: 300000, lastOrderAt: now, segment: 'ACTIVE',
    });
    prisma.order.findMany.mockResolvedValue([
      { id: 'o1', createdAt: new Date(now.getTime() - 20 * day), grandTotal: 100000 },
      { id: 'o2', createdAt: now, grandTotal: 200000 },
    ]);

    const result = await service.insightsFor('u1');

    expect(result.predictionAvailable).toBe(false);
    expect(result.nextPurchaseEstimate).toBeNull();
    expect(result.predictionNote).toContain('داده کافی');
  });

  it('computes a real moving-average next-purchase estimate once at least 3 real orders exist', async () => {
    const base = new Date('2026-01-01T00:00:00Z');
    const day = 24 * 60 * 60 * 1000;
    const o1 = { id: 'o1', createdAt: base, grandTotal: 100000 };
    const o2 = { id: 'o2', createdAt: new Date(base.getTime() + 10 * day), grandTotal: 100000 };
    const o3 = { id: 'o3', createdAt: new Date(base.getTime() + 20 * day), grandTotal: 100000 };
    segmentation.summaryFor.mockResolvedValue({
      userId: 'u1', fullName: 'کاربر', phone: '0912', customerType: 'RETAIL',
      orderCount: 3, totalSpend: 300000, lastOrderAt: o3.createdAt, segment: 'ACTIVE',
    });
    prisma.order.findMany.mockResolvedValue([o1, o2, o3]);
    prisma.orderItem.findMany.mockResolvedValue([]);

    const result = await service.insightsFor('u1');

    expect(result.predictionAvailable).toBe(true);
    expect(result.avgDaysBetweenOrders).toBe(10);
    expect(result.nextPurchaseEstimate?.getTime()).toBe(o3.createdAt.getTime() + 10 * day);
    expect(result.predictionNote).toBeNull();
  });

  it('aggregates real order items into frequent products and categories, sorted by real quantity', async () => {
    segmentation.summaryFor.mockResolvedValue({
      userId: 'u1', fullName: 'کاربر', phone: '0912', customerType: 'RETAIL',
      orderCount: 1, totalSpend: 100000, lastOrderAt: new Date(), segment: 'NEW',
    });
    prisma.order.findMany.mockResolvedValue([{ id: 'o1', createdAt: new Date(), grandTotal: 100000 }]);
    prisma.orderItem.findMany.mockResolvedValue([
      { productId: 'p1', nameSnapshot: 'لامپ LED', quantity: 3, product: { category: { id: 'c1', name: 'روشنایی' } } },
      { productId: 'p2', nameSnapshot: 'کلید تک پل', quantity: 1, product: { category: { id: 'c2', name: 'کلید و پریز' } } },
      { productId: 'p1', nameSnapshot: 'لامپ LED', quantity: 2, product: { category: { id: 'c1', name: 'روشنایی' } } },
    ]);

    const result = await service.insightsFor('u1');

    expect(result.frequentProducts[0]).toEqual({ productId: 'p1', name: 'لامپ LED', quantity: 5 });
    expect(result.frequentCategories[0]).toEqual({ categoryId: 'c1', name: 'روشنایی', quantity: 5 });
  });
});
