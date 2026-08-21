import { DashboardService } from './dashboard.service';

function buildOrder(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'o1',
    createdAt: new Date('2026-08-10T12:00:00Z'),
    grandTotal: 100_000,
    userId: 'u1',
    user: { customerType: 'RETAIL' },
    ...overrides,
  };
}

describe('DashboardService.report', () => {
  let prisma: any;
  let service: DashboardService;

  beforeEach(() => {
    prisma = {
      order: { findMany: jest.fn().mockResolvedValue([]), groupBy: jest.fn().mockResolvedValue([]) },
      orderItem: { findMany: jest.fn().mockResolvedValue([]) },
    };
    service = new DashboardService(
      prisma,
      { run: jest.fn().mockResolvedValue([]) } as any,
      { overview: jest.fn() } as any,
      { bestSellingLowStock: jest.fn(), crossSellPairs: jest.fn() } as any,
      { summary: jest.fn() } as any,
    );
  });

  it('only counts PROCESSING/SHIPPED/DELIVERED orders as revenue, never PENDING_PAYMENT/CANCELLED/REFUNDED', async () => {
    await service.report();

    const where = prisma.order.findMany.mock.calls[0][0].where;
    expect(where.status.in).toEqual(['PROCESSING', 'SHIPPED', 'DELIVERED']);
  });

  it('defaults to a trailing 30-day window when no from/to is given', async () => {
    await service.report();

    const where = prisma.order.findMany.mock.calls[0][0].where;
    const days = (where.createdAt.lte.getTime() - where.createdAt.gte.getTime()) / (24 * 60 * 60 * 1000);
    expect(Math.round(days)).toBe(30);
  });

  it('computes total revenue, order count, average order value, and unique customer count', async () => {
    prisma.order.findMany.mockResolvedValue([
      buildOrder({ id: 'o1', userId: 'u1', grandTotal: 100_000 }),
      buildOrder({ id: 'o2', userId: 'u1', grandTotal: 50_000 }),
      buildOrder({ id: 'o3', userId: 'u2', grandTotal: 150_000 }),
    ]);

    const result = await service.report();

    expect(result.summary).toEqual({
      totalRevenue: 300_000,
      totalOrders: 3,
      averageOrderValue: 100_000,
      uniqueCustomers: 2,
    });
  });

  it('reports zero average order value (not NaN/Infinity) when there are no orders in range', async () => {
    prisma.order.findMany.mockResolvedValue([]);

    const result = await service.report();

    expect(result.summary.averageOrderValue).toBe(0);
    expect(result.topProducts).toEqual([]);
    expect(result.revenueByCategory).toEqual([]);
  });

  it('groups revenue by day across the range', async () => {
    prisma.order.findMany.mockResolvedValue([
      buildOrder({ id: 'o1', createdAt: new Date('2026-08-10T08:00:00Z'), grandTotal: 100_000 }),
      buildOrder({ id: 'o2', createdAt: new Date('2026-08-10T20:00:00Z'), grandTotal: 50_000 }),
      buildOrder({ id: 'o3', createdAt: new Date('2026-08-11T08:00:00Z'), grandTotal: 30_000 }),
    ]);

    const result = await service.report();

    expect(result.revenueByDay).toEqual([
      { date: '2026-08-10', total: 150_000 },
      { date: '2026-08-11', total: 30_000 },
    ]);
  });

  it('splits revenue and order counts by customer segment (retail vs wholesale)', async () => {
    prisma.order.findMany.mockResolvedValue([
      buildOrder({ id: 'o1', userId: 'u1', grandTotal: 100_000, user: { customerType: 'RETAIL' } }),
      buildOrder({ id: 'o2', userId: 'u2', grandTotal: 500_000, user: { customerType: 'WHOLESALE' } }),
      buildOrder({ id: 'o3', userId: 'u3', grandTotal: 200_000, user: { customerType: 'WHOLESALE' } }),
    ]);

    const result = await service.report();

    expect(result.customerSegments).toEqual(
      expect.arrayContaining([
        { customerType: 'RETAIL', orders: 1, revenue: 100_000 },
        { customerType: 'WHOLESALE', orders: 2, revenue: 700_000 },
      ]),
    );
  });

  it('ranks top products by revenue and aggregates quantity sold across multiple orders', async () => {
    prisma.order.findMany.mockResolvedValue([buildOrder({ id: 'o1' }), buildOrder({ id: 'o2', userId: 'u2' })]);
    prisma.orderItem.findMany.mockResolvedValue([
      { productId: 'p1', nameSnapshot: 'لامپ LED', quantity: 2, lineTotal: 300_000, product: { category: { name: 'روشنایی' } } },
      { productId: 'p1', nameSnapshot: 'لامپ LED', quantity: 1, lineTotal: 150_000, product: { category: { name: 'روشنایی' } } },
      { productId: 'p2', nameSnapshot: 'پریز برق', quantity: 5, lineTotal: 400_000, product: { category: { name: 'برق' } } },
    ]);

    const result = await service.report();

    expect(result.topProducts[0]).toEqual({ productId: 'p1', name: 'لامپ LED', quantitySold: 3, revenue: 450_000 });
    expect(result.topProducts[1]).toEqual({ productId: 'p2', name: 'پریز برق', quantitySold: 5, revenue: 400_000 });
  });

  it('falls back to "دسته‌بندی‌نشده" for order items whose product has no category', async () => {
    prisma.order.findMany.mockResolvedValue([buildOrder({ id: 'o1' })]);
    prisma.orderItem.findMany.mockResolvedValue([
      { productId: 'p1', nameSnapshot: 'محصول بدون دسته', quantity: 1, lineTotal: 50_000, product: { category: null } },
    ]);

    const result = await service.report();

    expect(result.revenueByCategory).toEqual([{ categoryName: 'دسته‌بندی‌نشده', revenue: 50_000 }]);
  });

  it('does not query orderItem at all when there are no real-sale orders in range (avoids an empty IN () query)', async () => {
    prisma.order.findMany.mockResolvedValue([]);

    await service.report();

    expect(prisma.orderItem.findMany).not.toHaveBeenCalled();
  });

  it('includes the full order-status funnel for the range, independent of the real-sale revenue filter', async () => {
    prisma.order.groupBy.mockResolvedValue([
      { status: 'DELIVERED', _count: { _all: 5 } },
      { status: 'CANCELLED', _count: { _all: 2 } },
    ]);

    const result = await service.report();

    expect(result.ordersByStatus).toEqual([
      { status: 'DELIVERED', count: 5 },
      { status: 'CANCELLED', count: 2 },
    ]);
  });
});

const EMPTY_SALES_OVERVIEW = {
  today: { revenue: 0, orderCount: 0, averageOrderValue: 0 },
  thisMonth: { revenue: 0, orderCount: 0, averageOrderValue: 0 },
  bestSellersByRevenue: [],
  worstSellers: [],
  decliningSalesProducts: [],
  dataGaps: ['نرخ تبدیل: داده کافی موجود نیست'],
};

describe('DashboardService.aiControlCenter', () => {
  let prisma: any;
  let salesAnalytics: any;
  let opportunities: any;
  let abandonedCart: any;
  let service: DashboardService;

  beforeEach(() => {
    prisma = {
      productAiDraft: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
      question: { findMany: jest.fn().mockResolvedValue([]) },
      stock: { findMany: jest.fn().mockResolvedValue([]) },
      auditLog: { findMany: jest.fn().mockResolvedValue([]) },
      productSeoSuggestion: { findMany: jest.fn().mockResolvedValue([]) },
      contentDraft: { findMany: jest.fn().mockResolvedValue([]) },
      product: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
      aiUsageLog: { aggregate: jest.fn().mockResolvedValue({ _sum: { costToman: 0 } }), count: jest.fn().mockResolvedValue(0) },
      salesRecommendation: { findMany: jest.fn().mockResolvedValue([]) },
      newsItem: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
      activityLog: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
      orderItem: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
      electricalConsultation: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
    };
    salesAnalytics = { overview: jest.fn().mockResolvedValue(EMPTY_SALES_OVERVIEW) };
    opportunities = { bestSellingLowStock: jest.fn().mockResolvedValue([]), crossSellPairs: jest.fn().mockResolvedValue([]) };
    abandonedCart = { summary: jest.fn().mockResolvedValue({ count: 0, approximateValueToman: 0, frequentProducts: [], oldestAbandonedAt: null, carts: [] }) };
    service = new DashboardService(prisma, { run: jest.fn().mockResolvedValue([]) } as any, salesAnalytics, opportunities, abandonedCart);
  });

  it('only counts/lists drafts that are still PENDING_REVIEW', async () => {
    await service.aiControlCenter();

    expect(prisma.productAiDraft.count).toHaveBeenCalledWith({ where: { status: 'PENDING_REVIEW' } });
    const listCall = prisma.productAiDraft.findMany.mock.calls[0][0];
    expect(listCall.where).toEqual({ status: 'PENDING_REVIEW' });
  });

  it('only flags pending drafts that actually have an imageAutopilotNote set', async () => {
    await service.aiControlCenter();

    const attentionCall = prisma.productAiDraft.findMany.mock.calls[1][0];
    expect(attentionCall.where).toEqual({ status: 'PENDING_REVIEW', imageAutopilotNote: { not: null } });
  });

  it('only surfaces questions with zero answers, never already-answered ones', async () => {
    await service.aiControlCenter();

    const where = prisma.question.findMany.mock.calls[0][0].where;
    expect(where).toEqual({ answers: { none: {} } });
  });

  it('flattens low-stock variant rows into a real product name/sku/quantity shape', async () => {
    prisma.stock.findMany.mockResolvedValue([
      { quantity: 2, productVariant: { sku: 'SKU-1', product: { id: 'p1', name: 'کلید مینیاتوری' } } },
    ]);

    const result = await service.aiControlCenter();

    expect(result.lowStockVariants).toEqual([{ quantity: 2, sku: 'SKU-1', productId: 'p1', productName: 'کلید مینیاتوری' }]);
  });

  it('only pulls ai_*/seo.*/content.*/sales.*/news.*-prefixed audit log actions, not every admin action', async () => {
    await service.aiControlCenter();

    const where = prisma.auditLog.findMany.mock.calls[0][0].where;
    expect(where).toEqual({
      OR: [
        { action: { startsWith: 'ai_' } },
        { action: { startsWith: 'seo.' } },
        { action: { startsWith: 'content.' } },
        { action: { startsWith: 'sales.' } },
        { action: { startsWith: 'news.' } },
      ],
    });
  });

  it('resolves pending SEO suggestions to their real product name via a real Product lookup, not a fabricated one', async () => {
    prisma.productSeoSuggestion.findMany.mockResolvedValue([{ id: 's1', productId: 'p1', createdAt: new Date() }]);
    prisma.product.findMany.mockResolvedValue([{ id: 'p1', name: 'کلید مینیاتوری' }]);

    const result = await service.aiControlCenter();

    expect(result.pendingSeoSuggestions).toEqual([expect.objectContaining({ id: 's1', productName: 'کلید مینیاتوری' })]);
  });

  it('falls back to an honest placeholder when a suggestion points at a since-deleted product', async () => {
    prisma.productSeoSuggestion.findMany.mockResolvedValue([{ id: 's1', productId: 'gone', createdAt: new Date() }]);
    prisma.product.findMany.mockResolvedValue([]);

    const result = await service.aiControlCenter();

    expect(result.pendingSeoSuggestions[0].productName).toBe('محصول حذف‌شده');
  });

  it('runs the real SeoAuditService and summarizes real problems by severity, never a fabricated count', async () => {
    const seoAudit = { run: jest.fn().mockResolvedValue([{ severity: 'HIGH', entityType: 'Product', entityId: 'p1', entityName: 'x', field: 'metaTitle', message: 'm' }]) };
    service = new DashboardService(prisma, seoAudit as any, salesAnalytics, opportunities, abandonedCart);

    const result = await service.aiControlCenter();

    expect(seoAudit.run).toHaveBeenCalled();
    expect(result.seoProblemsCount).toBe(1);
    expect(result.seoProblemsBySeverity).toEqual({ HIGH: 1, MEDIUM: 0, LOW: 0 });
  });

  it('never fabricates a sales-opportunity widget — only real, existing signals are returned', async () => {
    const result = await service.aiControlCenter();

    expect(result).toEqual(
      expect.objectContaining({
        pendingDraftsCount: expect.any(Number),
        pendingDrafts: expect.any(Array),
        draftsNeedingAttention: expect.any(Array),
        unansweredQuestions: expect.any(Array),
        lowStockVariants: expect.any(Array),
        recentAiActivity: expect.any(Array),
        seoProblemsCount: expect.any(Number),
        pendingSeoSuggestions: expect.any(Array),
        pendingContentDrafts: expect.any(Array),
        productsNeedingSeoCount: expect.any(Number),
        aiUsageCostThisMonthToman: expect.any(Number),
        salesToday: expect.any(Object),
        salesThisMonth: expect.any(Object),
        bestSellers: expect.any(Array),
        worstSellers: expect.any(Array),
        criticalStockOpportunities: expect.any(Array),
        crossSellOpportunityCount: expect.any(Number),
        abandonedCarts: expect.any(Object),
        pendingSalesRecommendations: expect.any(Array),
        news: expect.any(Object),
        storeAi: expect.any(Object),
        consultant: expect.any(Object),
      }),
    );
    expect(result).not.toHaveProperty('salesOpportunities');
  });

  it('computes real Smart Electrical Consultant metrics — most-suggested products and no-match count from actually stored package snapshots, never fabricated', async () => {
    prisma.electricalConsultation.findMany.mockResolvedValue([
      {
        packagesJson: {
          ECONOMIC: { lines: [{ productId: 'p1', productName: 'کلید' }, { productId: 'p2', productName: 'پریز' }] },
          STANDARD: { lines: [{ productId: 'p1', productName: 'کلید' }] },
        },
        noMatchItemKeysJson: ['FUSE'],
      },
      { packagesJson: { ECONOMIC: { lines: [{ productId: 'p1', productName: 'کلید' }] } }, noMatchItemKeysJson: [] },
    ]);

    const result = await service.aiControlCenter();

    expect(result.consultant.packagesGeneratedThisMonth).toBe(2);
    expect(result.consultant.noMatchRequestsThisMonth).toBe(1);
    expect(result.consultant.mostSuggestedProducts[0]).toEqual({ productId: 'p1', name: 'کلید', count: 3 });
  });

  it('returns consultant conversion as null (never a fabricated rate) when there are no trackable add-to-cart clicks yet', async () => {
    const result = await service.aiControlCenter();
    expect(result.consultant.conversion).toBeNull();
  });

  it('surfaces real News Autopilot counts (pending review, discovered, published) and its own AI cost/error pool', async () => {
    prisma.newsItem.count.mockResolvedValueOnce(3).mockResolvedValueOnce(7).mockResolvedValueOnce(12);
    prisma.newsItem.findMany.mockResolvedValue([{ id: 'n1', draftTitle: 'خبر', rawTitle: 'خبر خام', category: 'روشنایی', createdAt: new Date() }]);

    const result = await service.aiControlCenter();

    expect(result.news).toEqual(
      expect.objectContaining({
        pendingReviewCount: 3,
        discoveredCount: 7,
        publishedCount: 12,
        pendingReview: [expect.objectContaining({ id: 'n1' })],
      }),
    );
  });

  it('reports real Store-only AI usage counts from ActivityLog for this month, never fabricated', async () => {
    prisma.activityLog.count
      .mockResolvedValueOnce(20) // product_query
      .mockResolvedValueOnce(15) // search_success
      .mockResolvedValueOnce(5); // search_no_result
    // add_to_cart count call happens too, but findMany drives the conversion calc
    const result = await service.aiControlCenter();

    expect(result.storeAi.productQueriesThisMonth).toBe(20);
    expect(result.storeAi.searchSuccessThisMonth).toBe(15);
    expect(result.storeAi.noResultSearchesThisMonth).toBe(5);
  });

  it('returns conversion as null (never a fabricated 0%) when there are no trackable AI add-to-cart clicks yet', async () => {
    prisma.activityLog.findMany.mockResolvedValue([]);

    const result = await service.aiControlCenter();

    expect(result.storeAi.conversion).toBeNull();
  });

  it('computes a real conversion rate only from logged-in add-to-cart clicks that are followed by a real matching paid order', async () => {
    const clickedAt = new Date('2026-08-01T10:00:00Z');
    prisma.activityLog.findMany.mockResolvedValue([
      { userId: 'u1', metadata: { productId: 'p1' }, createdAt: clickedAt },
      { userId: 'u2', metadata: { productId: 'p2' }, createdAt: clickedAt },
    ]);
    prisma.orderItem.findFirst.mockResolvedValueOnce({ id: 'oi1' }).mockResolvedValueOnce(null);

    const result = await service.aiControlCenter();

    expect(result.storeAi.conversion).toEqual({ trackableClicks: 2, converted: 1, rate: 0.5 });
  });
});
