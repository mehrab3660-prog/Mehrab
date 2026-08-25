import { classifyRisk, InventoryForecastService } from './inventory-forecast.service';

describe('classifyRisk', () => {
  it('maps real days-remaining thresholds to the documented risk tiers', () => {
    expect(classifyRisk(2)).toBe('CRITICAL');
    expect(classifyRisk(3)).toBe('CRITICAL');
    expect(classifyRisk(5)).toBe('LOW');
    expect(classifyRisk(7)).toBe('LOW');
    expect(classifyRisk(10)).toBe('REVIEW');
    expect(classifyRisk(14)).toBe('REVIEW');
    expect(classifyRisk(30)).toBe('NORMAL');
  });
});

describe('InventoryForecastService.forecast — real, deterministic, never fabricated (§1/§16)', () => {
  let prisma: any;
  let service: InventoryForecastService;

  beforeEach(() => {
    prisma = {
      productVariant: { findMany: jest.fn().mockResolvedValue([]) },
      order: { findMany: jest.fn().mockResolvedValue([]) },
      orderItem: { groupBy: jest.fn().mockResolvedValue([]) },
      product: { findMany: jest.fn().mockResolvedValue([]) },
    };
    service = new InventoryForecastService(prisma);
  });

  it('reports "insufficient data" — never a fabricated forecast — for a real published product with zero real sales in the window', async () => {
    prisma.product.findMany.mockResolvedValue([{ id: 'p1', name: 'محصول بدون فروش' }]);
    prisma.orderItem.groupBy.mockResolvedValue([]);

    const result = await service.forecast(30);

    expect(result.forecasts).toHaveLength(0);
    expect(result.insufficientData).toEqual([{ productId: 'p1', productName: 'محصول بدون فروش' }]);
  });

  it('nets out real reserved stock — available, not just on-shelf, quantity drives the forecast (رزروشده)', async () => {
    prisma.productVariant.findMany.mockResolvedValue([{ productId: 'p1', stocks: [{ quantity: 20, reservedQuantity: 15 }] }]);
    prisma.order.findMany.mockResolvedValue([{ id: 'o1' }]);
    prisma.orderItem.groupBy.mockResolvedValue([{ productId: 'p1', _sum: { quantity: 30 } }]);
    prisma.product.findMany.mockResolvedValue([{ id: 'p1', name: 'کلید' }]);

    const result = await service.forecast(30);

    // available = 20 - 15 = 5; avgDailySales = 30/30 = 1/day; daysRemaining = 5
    expect(result.forecasts[0]).toEqual(
      expect.objectContaining({ productId: 'p1', currentStock: 5, avgDailySales: 1, daysRemaining: 5, riskLevel: 'LOW' }),
    );
  });

  it('suggests a real reorder quantity that tops the real current stock up to the target coverage window, never negative', async () => {
    prisma.productVariant.findMany.mockResolvedValue([{ productId: 'p1', stocks: [{ quantity: 2, reservedQuantity: 0 }] }]);
    prisma.order.findMany.mockResolvedValue([{ id: 'o1' }]);
    prisma.orderItem.groupBy.mockResolvedValue([{ productId: 'p1', _sum: { quantity: 30 } }]); // 1/day over 30 days
    prisma.product.findMany.mockResolvedValue([{ id: 'p1', name: 'لامپ' }]);

    const result = await service.forecast(30, 14); // 14-day target coverage

    // target = 1 * 14 = 14; suggested = ceil(14 - 2) = 12
    expect(result.forecasts[0].suggestedReorderQuantity).toBe(12);
  });

  it('never suggests a negative reorder quantity when current stock already exceeds the target coverage', async () => {
    prisma.productVariant.findMany.mockResolvedValue([{ productId: 'p1', stocks: [{ quantity: 1000, reservedQuantity: 0 }] }]);
    prisma.order.findMany.mockResolvedValue([{ id: 'o1' }]);
    prisma.orderItem.groupBy.mockResolvedValue([{ productId: 'p1', _sum: { quantity: 30 } }]);
    prisma.product.findMany.mockResolvedValue([{ id: 'p1', name: 'لامپ' }]);

    const result = await service.forecast(30, 14);

    expect(result.forecasts[0].suggestedReorderQuantity).toBe(0);
    expect(result.forecasts[0].riskLevel).toBe('NORMAL');
  });

  it('reports zero real days remaining (never a fake positive runway) when real stock is already at or below zero but real sales exist', async () => {
    prisma.productVariant.findMany.mockResolvedValue([{ productId: 'p1', stocks: [{ quantity: 0, reservedQuantity: 0 }] }]);
    prisma.order.findMany.mockResolvedValue([{ id: 'o1' }]);
    prisma.orderItem.groupBy.mockResolvedValue([{ productId: 'p1', _sum: { quantity: 10 } }]);
    prisma.product.findMany.mockResolvedValue([{ id: 'p1', name: 'لامپ' }]);

    const result = await service.forecast(30);

    expect(result.forecasts[0].daysRemaining).toBe(0);
    expect(result.forecasts[0].riskLevel).toBe('CRITICAL');
  });

  it('sorts real forecasts by urgency — the product closest to running out first', async () => {
    prisma.productVariant.findMany.mockResolvedValue([
      { productId: 'urgent', stocks: [{ quantity: 2, reservedQuantity: 0 }] },
      { productId: 'safe', stocks: [{ quantity: 100, reservedQuantity: 0 }] },
    ]);
    prisma.order.findMany.mockResolvedValue([{ id: 'o1' }]);
    prisma.orderItem.groupBy.mockResolvedValue([
      { productId: 'urgent', _sum: { quantity: 30 } },
      { productId: 'safe', _sum: { quantity: 30 } },
    ]);
    prisma.product.findMany.mockResolvedValue([
      { id: 'urgent', name: 'فوری' },
      { id: 'safe', name: 'امن' },
    ]);

    const result = await service.forecast(30);

    expect(result.forecasts.map((f) => f.productId)).toEqual(['urgent', 'safe']);
  });
});
