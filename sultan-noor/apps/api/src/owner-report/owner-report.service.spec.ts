import { OwnerReportService } from './owner-report.service';

function baseOverview(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    today: { revenue: 0, orderCount: 0, averageOrderValue: 0 },
    thisMonth: { revenue: 0, orderCount: 0, averageOrderValue: 0 },
    window: { days: 30, revenue: 0, orderCount: 0, averageOrderValue: 0 },
    bestSellersByRevenue: [],
    bestSellersByQuantity: [],
    worstSellers: [],
    noSalesProducts: [],
    decliningSalesProducts: [],
    revenueByDay: [],
    dataGaps: ['نرخ تبدیل: داده کافی نیست'],
    ...overrides,
  };
}

describe('OwnerReportService — real-data-only daily/weekly report (§7/§9/§16)', () => {
  let prisma: any;
  let salesAnalytics: any;
  let abandonedCart: any;
  let inventoryForecast: any;
  let service: OwnerReportService;

  beforeEach(() => {
    prisma = {
      question: { count: jest.fn().mockResolvedValue(0) },
      productAiDraft: { count: jest.fn().mockResolvedValue(0) },
      productSeoSuggestion: { count: jest.fn().mockResolvedValue(0) },
      contentDraft: { count: jest.fn().mockResolvedValue(0) },
      salesRecommendation: { count: jest.fn().mockResolvedValue(0) },
      newsItem: { count: jest.fn().mockResolvedValue(0) },
      reorderRecommendation: { count: jest.fn().mockResolvedValue(0) },
      aiUsageLog: { count: jest.fn().mockResolvedValue(0), aggregate: jest.fn().mockResolvedValue({ _sum: { costToman: 0 } }) },
    };
    salesAnalytics = { overview: jest.fn().mockResolvedValue(baseOverview()), weekOverWeek: jest.fn() };
    abandonedCart = { summary: jest.fn().mockResolvedValue({ count: 0, approximateValueToman: 0, frequentProducts: [], oldestAbandonedAt: null, carts: [] }) };
    inventoryForecast = { forecast: jest.fn().mockResolvedValue({ forecasts: [], insufficientData: [], windowDays: 30 }) };
    service = new OwnerReportService(prisma, salesAnalytics, abandonedCart, inventoryForecast);
  });

  it('produces an empty importantIssues list on a real quiet day — never a fabricated warning', async () => {
    const report = await service.dailyReport();
    expect(report.importantIssues).toEqual([]);
  });

  it('surfaces a real critical-stock issue only when the real forecast actually contains a CRITICAL product', async () => {
    inventoryForecast.forecast.mockResolvedValue({
      forecasts: [{ productId: 'p1', productName: 'لامپ LED', currentStock: 1, avgDailySales: 2, daysRemaining: 0.5, riskLevel: 'CRITICAL', suggestedReorderQuantity: 20 }],
      insufficientData: [],
      windowDays: 30,
    });

    const report = await service.dailyReport();

    expect(report.inventory.criticalCount).toBe(1);
    expect(report.importantIssues.some((s: string) => s.includes('بحرانی'))).toBe(true);
  });

  it('surfaces a real abandoned-cart issue only from the real AbandonedCartInsightService count', async () => {
    abandonedCart.summary.mockResolvedValue({ count: 3, approximateValueToman: 500000, frequentProducts: [], oldestAbandonedAt: new Date(), carts: [] });

    const report = await service.dailyReport();

    expect(report.abandonedCarts.count).toBe(3);
    expect(report.importantIssues.some((s: string) => s.includes('سبد خرید'))).toBe(true);
  });

  it('sums real pending-approval counts across every real approval-workflow table', async () => {
    prisma.productAiDraft.count.mockResolvedValue(2);
    prisma.reorderRecommendation.count.mockResolvedValue(1);

    const report = await service.dailyReport();

    expect(report.pendingApprovals.total).toBe(3);
    expect(report.importantIssues.some((s: string) => s.includes('تأیید'))).toBe(true);
  });

  it('reports a real, honest weekly comparisonAvailable=false with a note when there is no last-week data', async () => {
    salesAnalytics.weekOverWeek.mockResolvedValue({ thisWeek: { revenue: 0, orderCount: 0, averageOrderValue: 0 }, lastWeek: { revenue: 0, orderCount: 0, averageOrderValue: 0 }, revenueChangePercent: null, orderCountChangePercent: null, comparisonAvailable: false });

    const report = await service.weeklyReport();

    expect(report.comparisonAvailable).toBe(false);
    expect(report.note).toContain('داده کافی');
  });

  it('carries through a real weekly comparison with no note when comparisonAvailable=true', async () => {
    salesAnalytics.weekOverWeek.mockResolvedValue({
      thisWeek: { revenue: 400000, orderCount: 2, averageOrderValue: 200000 },
      lastWeek: { revenue: 100000, orderCount: 1, averageOrderValue: 100000 },
      revenueChangePercent: 300,
      orderCountChangePercent: 100,
      comparisonAvailable: true,
    });

    const report = await service.weeklyReport();

    expect(report.comparisonAvailable).toBe(true);
    expect(report.note).toBeNull();
    expect(report.revenueChangePercent).toBe(300);
  });
});
