import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SalesRecommendationService } from './sales-recommendation.service';

function buildRec(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'r1',
    type: 'DISCOUNT',
    status: 'PENDING_REVIEW',
    productIds: ['p1'],
    title: 'پیشنهاد',
    reason: 'دلیل',
    ...overrides,
  };
}

describe('SalesRecommendationService', () => {
  let prisma: any;
  let settings: any;
  let auditLog: any;
  let aiUsage: any;
  let opportunities: any;
  let analytics: any;
  let abandonedCart: any;
  let service: SalesRecommendationService;
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    prisma = {
      salesRecommendation: { create: jest.fn(), update: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      product: { findUnique: jest.fn(), findMany: jest.fn() },
    };
    settings = { resolve: jest.fn() };
    auditLog = { record: jest.fn() };
    aiUsage = { checkBudget: jest.fn().mockResolvedValue(true), record: jest.fn() };
    opportunities = { crossSellPairs: jest.fn().mockResolvedValue([]), staleInventory: jest.fn().mockResolvedValue([]) };
    analytics = { bestSellers: jest.fn().mockResolvedValue([]) };
    abandonedCart = { summary: jest.fn() };
    service = new SalesRecommendationService(prisma, settings, auditLog, aiUsage, opportunities, analytics, abandonedCart);
    fetchSpy = jest.spyOn(global, 'fetch' as any);
  });

  afterEach(() => fetchSpy.mockRestore());

  describe('generateCrossSellDrafts (rule-based, no AI)', () => {
    it('creates a draft from a real co-purchase pair without ever calling the AI provider', async () => {
      opportunities.crossSellPairs.mockResolvedValue([{ productAId: 'p1', productAName: 'لامپ', productBId: 'p2', productBName: 'سرپیچ', coOccurrence: 4 }]);
      prisma.salesRecommendation.create.mockResolvedValue(buildRec({ type: 'CROSS_SELL' }));

      const result = await service.generateCrossSellDrafts('user1');

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(prisma.salesRecommendation.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: 'CROSS_SELL', productIds: ['p1', 'p2'] }) }),
      );
      expect(result).toHaveLength(1);
    });

    it('never creates a duplicate draft for a pair that already has a pending suggestion', async () => {
      opportunities.crossSellPairs.mockResolvedValue([{ productAId: 'p1', productAName: 'لامپ', productBId: 'p2', productBName: 'سرپیچ', coOccurrence: 4 }]);
      prisma.salesRecommendation.findMany.mockResolvedValue([buildRec({ type: 'CROSS_SELL', productIds: ['p2', 'p1'] })]);

      const result = await service.generateCrossSellDrafts('user1');

      expect(prisma.salesRecommendation.create).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });
  });

  describe('generateBundleDrafts (rule-based, no AI)', () => {
    it('never assigns its own bundle price — approval/pricing is left to the admin', async () => {
      opportunities.crossSellPairs.mockResolvedValue([{ productAId: 'p1', productAName: 'لامپ', productBId: 'p2', productBName: 'سرپیچ', coOccurrence: 5 }]);
      prisma.salesRecommendation.create.mockResolvedValue(buildRec({ type: 'BUNDLE' }));

      await service.generateBundleDrafts('user1');

      const data = prisma.salesRecommendation.create.mock.calls[0][0].data;
      expect(data.payload).not.toHaveProperty('price');
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe('generateAbandonedCartSuggestion (rule-based, no AI)', () => {
    it('returns null instead of fabricating a suggestion when there are no real abandoned carts', async () => {
      abandonedCart.summary.mockResolvedValue({ count: 0, approximateValueToman: 0, frequentProducts: [], oldestAbandonedAt: null, carts: [] });

      const result = await service.generateAbandonedCartSuggestion('user1');

      expect(result).toBeNull();
      expect(prisma.salesRecommendation.create).not.toHaveBeenCalled();
    });

    it('builds the reason text from real numbers, and never auto-sends anything', async () => {
      abandonedCart.summary.mockResolvedValue({
        count: 12,
        approximateValueToman: 900_000,
        frequentProducts: [{ productId: 'p1', name: 'لامپ LED', count: 5 }],
        oldestAbandonedAt: new Date(),
        carts: [],
      });
      prisma.salesRecommendation.create.mockResolvedValue(buildRec({ type: 'ABANDONED_CART' }));

      await service.generateAbandonedCartSuggestion('user1');

      const data = prisma.salesRecommendation.create.mock.calls[0][0].data;
      expect(data.reason).toContain('12');
      expect(data.reason).toContain('لامپ LED');
      expect(data.confidenceNote).toMatch(/تأیید و تنظیمات جداگانه مالک/);
    });
  });

  describe('generateDiscount (AI-generated)', () => {
    it('fails gracefully with a clear Persian message when no API key is configured — never crashes the store', async () => {
      settings.resolve.mockResolvedValue(undefined);
      await expect(service.generateDiscount({ productId: 'p1' })).rejects.toThrow(BadRequestException);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('refuses once the monthly sales-AI budget is exhausted', async () => {
      settings.resolve.mockResolvedValue('key');
      aiUsage.checkBudget.mockResolvedValue(false);
      await expect(service.generateDiscount({ productId: 'p1' })).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException for a product that does not really exist', async () => {
      settings.resolve.mockResolvedValue('key');
      prisma.product.findUnique.mockResolvedValue(null);
      await expect(service.generateDiscount({ productId: 'missing' })).rejects.toThrow(NotFoundException);
    });

    it('never mutates the real Product row — only ever creates a Draft suggestion', async () => {
      settings.resolve.mockResolvedValue('key');
      prisma.product.findUnique.mockResolvedValue({ id: 'p1', name: 'لامپ LED', basePrice: 100_000, category: { name: 'روشنایی' } });
      fetchSpy.mockResolvedValue({ json: () => Promise.resolve({ content: [{ text: JSON.stringify({ discountPercent: 20, suggestedDurationDays: 7, reason: 'فروش کم', risk: 'کاهش سود' }) }] }) } as any);
      prisma.salesRecommendation.create.mockResolvedValue(buildRec());

      await service.generateDiscount({ productId: 'p1' }, 'user1');

      expect(prisma.product.update).toBeUndefined(); // no such mock even wired — the service never calls it
      const data = prisma.salesRecommendation.create.mock.calls[0][0].data;
      expect(data.type).toBe('DISCOUNT');
      expect(data.payload.discountPercent).toBe(20);
      expect(data.payload.suggestedFinalPrice).toBe(80_000);
      expect(data.confidenceNote).toMatch(/اقدام دستی مالک/);
    });

    it('clamps an out-of-range AI-suggested discount percent rather than trusting it blindly', async () => {
      settings.resolve.mockResolvedValue('key');
      prisma.product.findUnique.mockResolvedValue({ id: 'p1', name: 'لامپ LED', basePrice: 100_000, category: { name: 'روشنایی' } });
      fetchSpy.mockResolvedValue({ json: () => Promise.resolve({ content: [{ text: JSON.stringify({ discountPercent: 999, reason: 'x', risk: 'y' }) }] }) } as any);
      prisma.salesRecommendation.create.mockResolvedValue(buildRec());

      await service.generateDiscount({ productId: 'p1' });

      const data = prisma.salesRecommendation.create.mock.calls[0][0].data;
      expect(data.payload.discountPercent).toBeLessThanOrEqual(70);
    });

    it('logs failed usage and surfaces a graceful error when the AI call itself fails', async () => {
      settings.resolve.mockResolvedValue('key');
      prisma.product.findUnique.mockResolvedValue({ id: 'p1', name: 'لامپ LED', basePrice: 100_000, category: null });
      fetchSpy.mockRejectedValue(new Error('network down'));

      await expect(service.generateDiscount({ productId: 'p1' })).rejects.toThrow(BadRequestException);
      expect(aiUsage.record).toHaveBeenCalledWith('p1', false, expect.any(Number));
    });
  });

  describe('generateCampaign (AI-generated)', () => {
    it('requires at least one real product or category — never invents products for a campaign', async () => {
      settings.resolve.mockResolvedValue('key');
      prisma.product.findMany.mockResolvedValue([]);
      await expect(service.generateCampaign({ topic: 'کمپین لامپ' })).rejects.toThrow(BadRequestException);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('creates a CAMPAIGN draft grounded in real products, never auto-active', async () => {
      settings.resolve.mockResolvedValue('key');
      prisma.product.findMany.mockResolvedValue([{ id: 'p1', name: 'لامپ LED', basePrice: 100_000 }]);
      fetchSpy.mockResolvedValue({
        json: () => Promise.resolve({ content: [{ text: JSON.stringify({ title: 'کمپین لامپ', goal: 'فروش', audience: 'همه', adCopy: 'متن', suggestedDurationDays: 7 }) }] }),
      } as any);
      prisma.salesRecommendation.create.mockResolvedValue(buildRec({ type: 'CAMPAIGN', status: 'PENDING_REVIEW' }));

      const rec = await service.generateCampaign({ topic: 'کمپین لامپ', productIds: ['p1'] });

      const data = prisma.salesRecommendation.create.mock.calls[0][0].data;
      expect(data.type).toBe('CAMPAIGN');
      expect(rec.status).toBe('PENDING_REVIEW');
    });
  });

  describe('approval workflow', () => {
    it('approve() never mutates price/discount/campaign/inventory state — only marks the row reviewed', async () => {
      prisma.salesRecommendation.findUnique.mockResolvedValue(buildRec());
      prisma.salesRecommendation.update.mockResolvedValue(buildRec({ status: 'APPROVED' }));

      await service.approve('r1', 'user1');

      expect(prisma.salesRecommendation.update).toHaveBeenCalledWith({
        where: { id: 'r1' },
        data: { status: 'APPROVED', reviewedByUserId: 'user1', reviewedAt: expect.any(Date) },
      });
      expect(prisma.product.findUnique).not.toHaveBeenCalled();
    });

    it('rejects approving something already reviewed', async () => {
      prisma.salesRecommendation.findUnique.mockResolvedValue(buildRec({ status: 'REJECTED' }));
      await expect(service.approve('r1')).rejects.toThrow(BadRequestException);
    });

    it('rejects editing/rejecting anything not still PENDING_REVIEW', async () => {
      prisma.salesRecommendation.findUnique.mockResolvedValue(buildRec({ status: 'APPROVED' }));
      await expect(service.update('r1', { title: 'x' })).rejects.toThrow(BadRequestException);
      await expect(service.reject('r1', 'دلیل')).rejects.toThrow(BadRequestException);
    });
  });

  describe('activate (campaigns only, APPROVED -> ACTIVE)', () => {
    it('refuses to activate a non-CAMPAIGN suggestion', async () => {
      prisma.salesRecommendation.findUnique.mockResolvedValue(buildRec({ type: 'DISCOUNT', status: 'APPROVED' }));
      await expect(service.activate('r1')).rejects.toThrow(BadRequestException);
    });

    it('refuses to activate a campaign that has not been approved yet', async () => {
      prisma.salesRecommendation.findUnique.mockResolvedValue(buildRec({ type: 'CAMPAIGN', status: 'PENDING_REVIEW' }));
      await expect(service.activate('r1')).rejects.toThrow(BadRequestException);
    });

    it('activates an approved campaign as an explicit, separate step', async () => {
      prisma.salesRecommendation.findUnique.mockResolvedValue(buildRec({ type: 'CAMPAIGN', status: 'APPROVED' }));
      prisma.salesRecommendation.update.mockResolvedValue(buildRec({ type: 'CAMPAIGN', status: 'ACTIVE' }));

      const rec = await service.activate('r1', 'user1');
      expect(rec.status).toBe('ACTIVE');
    });
  });
});
