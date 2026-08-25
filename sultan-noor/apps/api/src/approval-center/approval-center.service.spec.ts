import { BadRequestException } from '@nestjs/common';
import { ApprovalCenterService } from './approval-center.service';

describe('ApprovalCenterService — pure aggregation + dispatch, never a parallel approval system (§11)', () => {
  let prisma: any;
  let aiProduct: any;
  let seoSuggestion: any;
  let contentAutopilot: any;
  let salesRecommendation: any;
  let newsContent: any;
  let reorderRecommendation: any;
  let service: ApprovalCenterService;

  beforeEach(() => {
    prisma = {
      productAiDraft: { findMany: jest.fn().mockResolvedValue([]) },
      productSeoSuggestion: { findMany: jest.fn().mockResolvedValue([]) },
      contentDraft: { findMany: jest.fn().mockResolvedValue([]) },
      salesRecommendation: { findMany: jest.fn().mockResolvedValue([]) },
      newsItem: { findMany: jest.fn().mockResolvedValue([]) },
      reorderRecommendation: { findMany: jest.fn().mockResolvedValue([]) },
      product: { findMany: jest.fn().mockResolvedValue([]) },
    };
    aiProduct = { approve: jest.fn(), reject: jest.fn() };
    seoSuggestion = { approve: jest.fn(), reject: jest.fn() };
    contentAutopilot = { approve: jest.fn(), reject: jest.fn() };
    salesRecommendation = { approve: jest.fn(), reject: jest.fn() };
    newsContent = { approve: jest.fn(), reject: jest.fn() };
    reorderRecommendation = { approve: jest.fn(), reject: jest.fn() };
    service = new ApprovalCenterService(prisma, aiProduct, seoSuggestion, contentAutopilot, salesRecommendation, newsContent, reorderRecommendation);
  });

  it('aggregates real pending items from every domain into one sorted list with per-type counts', async () => {
    const now = new Date();
    const earlier = new Date(now.getTime() - 1000);
    prisma.productAiDraft.findMany.mockResolvedValue([{ id: 'd1', name: 'لامپ جدید', createdAt: earlier }]);
    prisma.reorderRecommendation.findMany.mockResolvedValue([{ id: 'r1', productName: 'کلید تک پل', createdAt: now }]);

    const result = await service.list();

    expect(result.total).toBe(2);
    expect(result.counts.PRODUCT_DRAFT).toBe(1);
    expect(result.counts.REORDER_RECOMMENDATION).toBe(1);
    expect(result.items[0].id).toBe('r1'); // most recent first
    expect(result.items[1].id).toBe('d1');
  });

  it('resolves a real product name for an SEO suggestion via a separate lookup (no Prisma relation exists on that table)', async () => {
    prisma.productSeoSuggestion.findMany.mockResolvedValue([{ id: 's1', productId: 'p1', createdAt: new Date() }]);
    prisma.product.findMany.mockResolvedValue([{ id: 'p1', name: 'لامپ LED نه وات' }]);

    const result = await service.list();

    expect(result.items[0].title).toContain('لامپ LED نه وات');
  });

  it('honestly labels an SEO suggestion for a since-deleted product rather than fabricating a name', async () => {
    prisma.productSeoSuggestion.findMany.mockResolvedValue([{ id: 's1', productId: 'gone', createdAt: new Date() }]);
    prisma.product.findMany.mockResolvedValue([]);

    const result = await service.list();

    expect(result.items[0].title).toContain('محصول حذف‌شده');
  });

  it('dispatches approve() for each type to that domain own already-tested service, never reimplementing approval logic', async () => {
    await service.approve('PRODUCT_DRAFT', 'd1', 'user1');
    expect(aiProduct.approve).toHaveBeenCalledWith('d1', {}, 'user1');

    await service.approve('SEO_SUGGESTION', 's1', 'user1');
    expect(seoSuggestion.approve).toHaveBeenCalledWith('s1', 'user1');

    await service.approve('CONTENT_DRAFT', 'c1', 'user1');
    expect(contentAutopilot.approve).toHaveBeenCalledWith('c1', {}, 'user1');

    await service.approve('SALES_RECOMMENDATION', 'sr1', 'user1');
    expect(salesRecommendation.approve).toHaveBeenCalledWith('sr1', 'user1');

    await service.approve('NEWS_ITEM', 'n1', 'user1');
    expect(newsContent.approve).toHaveBeenCalledWith('n1', 'user1');

    await service.approve('REORDER_RECOMMENDATION', 'rr1', 'user1');
    expect(reorderRecommendation.approve).toHaveBeenCalledWith('rr1', 'user1');
  });

  it('dispatches reject() with the real reason for each type to that domain own service', async () => {
    await service.reject('NEWS_ITEM', 'n1', 'not relevant', 'user1');
    expect(newsContent.reject).toHaveBeenCalledWith('n1', 'not relevant', 'user1');
  });

  it('rejects an unknown approval item type rather than silently doing nothing', async () => {
    await expect(service.approve('UNKNOWN' as any, 'x1', 'user1')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.reject('UNKNOWN' as any, 'x1', undefined, 'user1')).rejects.toBeInstanceOf(BadRequestException);
  });
});
