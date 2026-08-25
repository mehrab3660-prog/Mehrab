import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SeoSuggestionService } from './seo-suggestion.service';

function buildProduct(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'p1',
    name: 'کلید مینیاتوری ۱۶ آمپر',
    description: 'توضیح فعلی',
    basePrice: 250000 as any,
    metaTitle: null,
    metaDescription: null,
    searchKeywords: null,
    categoryId: 'cat1',
    brand: { name: 'اشنایدر' },
    category: { name: 'کلید و پریز' },
    images: [{ id: 'img1', altText: null }, { id: 'img2', altText: 'قبلی' }],
    ...overrides,
  };
}

function buildSuggestion(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 's1',
    productId: 'p1',
    metaTitle: 'عنوان پیشنهادی',
    metaDescription: 'توضیح متای پیشنهادی با طول مناسب برای موتور جستجو که کاملاً استاندارد است.',
    searchKeywords: 'کلید, مینیاتوری',
    h1Suggestion: 'پیشنهاد H1',
    descriptionSuggestion: 'توضیحات جدید و بهتر محصول',
    faq: [{ q: 'س', a: 'ج' }],
    altTextSuggestions: { img1: 'تصویر جدید ۱' },
    internalLinks: [],
    status: 'PENDING_REVIEW',
    ...overrides,
  };
}

describe('SeoSuggestionService', () => {
  let prisma: any;
  let settings: any;
  let auditLog: any;
  let aiUsage: any;
  let service: SeoSuggestionService;
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    prisma = {
      product: { findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      productImage: { update: jest.fn().mockResolvedValue({}) },
      productSeoSuggestion: { create: jest.fn(), update: jest.fn(), findUnique: jest.fn(), findMany: jest.fn() },
      blogPost: { findMany: jest.fn().mockResolvedValue([]) },
    };
    settings = { resolve: jest.fn() };
    auditLog = { record: jest.fn() };
    aiUsage = { checkBudget: jest.fn().mockResolvedValue(true), record: jest.fn() };
    service = new SeoSuggestionService(prisma, settings, auditLog, aiUsage);
    fetchSpy = jest.spyOn(global, 'fetch' as any);
  });

  afterEach(() => fetchSpy.mockRestore());

  describe('generate', () => {
    it('rejects when no Anthropic key is configured', async () => {
      settings.resolve.mockResolvedValue(undefined);
      await expect(service.generate('p1')).rejects.toThrow(BadRequestException);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for a missing product', async () => {
      settings.resolve.mockImplementation((k: string) => Promise.resolve(k === 'anthropicApiKey' ? 'sk' : undefined));
      prisma.product.findUnique.mockResolvedValue(null);
      await expect(service.generate('missing')).rejects.toThrow(NotFoundException);
    });

    it('rejects when the monthly SEO/content budget is exhausted', async () => {
      settings.resolve.mockImplementation((k: string) => Promise.resolve(k === 'anthropicApiKey' ? 'sk' : undefined));
      prisma.product.findUnique.mockResolvedValue(buildProduct());
      aiUsage.checkBudget.mockResolvedValue(false);
      await expect(service.generate('p1')).rejects.toThrow(BadRequestException);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('grounds the prompt in real product data and only offers real internal links', async () => {
      settings.resolve.mockImplementation((k: string) => Promise.resolve(k === 'anthropicApiKey' ? 'sk' : undefined));
      prisma.product.findUnique.mockResolvedValue(buildProduct());
      prisma.product.findMany.mockResolvedValue([{ name: 'محصول مرتبط', slug: 'related-product' }]);
      prisma.blogPost.findMany.mockResolvedValue([{ title: 'مقاله', slug: 'article' }]);
      const modelJson = {
        metaTitle: 'عنوان جدید',
        metaDescription: 'توضیح جدید',
        searchKeywords: 'کلید',
        h1Suggestion: 'H1',
        descriptionSuggestion: 'توضیحات جدید',
        faq: [],
        altTextSuggestions: { '0': 'اول', '1': 'دوم' },
        internalLinks: [{ label: 'محصول مرتبط', url: '/products/related-product' }, { label: 'جعلی', url: '/products/fake-slug' }],
        confidenceNote: 'یادداشت',
      };
      fetchSpy.mockResolvedValue({ json: () => Promise.resolve({ content: [{ text: JSON.stringify(modelJson) }] }) } as any);
      prisma.productSeoSuggestion.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 's1', ...data }));

      const suggestion = await service.generate('p1', 'user1');

      const [, requestInit] = fetchSpy.mock.calls[0];
      const body = JSON.parse(requestInit.body);
      expect(body.messages[0].content).toContain('کلید مینیاتوری ۱۶ آمپر');
      expect(body.messages[0].content).toContain('related-product');

      // altTextSuggestions mapped from index -> real image id
      expect(suggestion.altTextSuggestions).toEqual({ img1: 'اول', img2: 'دوم' });
      // the fabricated /products/fake-slug link must be dropped
      expect(suggestion.internalLinks).toEqual([{ label: 'محصول مرتبط', url: '/products/related-product' }]);
      expect(auditLog.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'seo.suggestion_generated', userId: 'user1' }));
      expect(aiUsage.record).toHaveBeenCalledWith('seo-generation', 'p1', true, expect.any(Number));
    });

    it('records a failed usage entry and throws BadRequestException on API failure', async () => {
      settings.resolve.mockImplementation((k: string) => Promise.resolve(k === 'anthropicApiKey' ? 'sk' : undefined));
      prisma.product.findUnique.mockResolvedValue(buildProduct());
      fetchSpy.mockRejectedValue(new Error('network down'));
      await expect(service.generate('p1')).rejects.toThrow(BadRequestException);
      expect(aiUsage.record).toHaveBeenCalledWith('seo-generation', 'p1', false, expect.any(Number));
    });

    it('auto-applies only metaDescription/searchKeywords/altText when seoAutoFixEnabled AND aiAutonomousMode are both true, never metaTitle/description/H1', async () => {
      settings.resolve.mockImplementation((k: string) => {
        if (k === 'anthropicApiKey') return Promise.resolve('sk');
        if (k === 'seoAutoFixEnabled') return Promise.resolve('true');
        if (k === 'aiAutonomousMode') return Promise.resolve('true');
        return Promise.resolve(undefined);
      });
      prisma.product.findUnique.mockResolvedValue(buildProduct());
      const modelJson = {
        metaTitle: 'عنوان جدید که هرگز نباید خودکار اعمال شود',
        metaDescription: 'توضیح متای جدید که باید خودکار اعمال شود چون کم‌ریسک است.',
        searchKeywords: 'کلید, جدید',
        h1Suggestion: 'H1 جدید',
        descriptionSuggestion: 'توضیحات کاملاً جدید که هرگز نباید خودکار اعمال شود',
        faq: [],
        altTextSuggestions: { '0': 'الت جدید' },
        internalLinks: [],
      };
      fetchSpy.mockResolvedValue({ json: () => Promise.resolve({ content: [{ text: JSON.stringify(modelJson) }] }) } as any);
      prisma.productSeoSuggestion.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 's1', ...data }));
      prisma.productSeoSuggestion.update.mockResolvedValue({});

      await service.generate('p1');

      const productUpdateCall = prisma.product.update.mock.calls.find((c: any) => c[0].where.id === 'p1');
      expect(productUpdateCall[0].data).toEqual({ metaDescription: modelJson.metaDescription, searchKeywords: modelJson.searchKeywords });
      expect(productUpdateCall[0].data).not.toHaveProperty('metaTitle');
      expect(productUpdateCall[0].data).not.toHaveProperty('description');
      expect(prisma.productImage.update).toHaveBeenCalledWith({ where: { id: 'img1' }, data: { altText: 'الت جدید' } });
      expect(auditLog.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'seo.auto_fix_applied' }));
    });

    it('never auto-applies anything when seoAutoFixEnabled is unset (default off)', async () => {
      settings.resolve.mockImplementation((k: string) => Promise.resolve(k === 'anthropicApiKey' ? 'sk' : undefined));
      prisma.product.findUnique.mockResolvedValue(buildProduct());
      fetchSpy.mockResolvedValue({ json: () => Promise.resolve({ content: [{ text: JSON.stringify({ metaDescription: 'x' }) }] }) } as any);
      prisma.productSeoSuggestion.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 's1', ...data }));

      await service.generate('p1');

      expect(prisma.product.update).not.toHaveBeenCalled();
    });

    it('never auto-applies when seoAutoFixEnabled is true but aiAutonomousMode is off — the store-wide master switch (§10) governs every AI auto-execution', async () => {
      settings.resolve.mockImplementation((k: string) => {
        if (k === 'anthropicApiKey') return Promise.resolve('sk');
        if (k === 'seoAutoFixEnabled') return Promise.resolve('true');
        return Promise.resolve(undefined); // aiAutonomousMode left unset = off
      });
      prisma.product.findUnique.mockResolvedValue(buildProduct());
      fetchSpy.mockResolvedValue({ json: () => Promise.resolve({ content: [{ text: JSON.stringify({ metaDescription: 'x' }) }] }) } as any);
      prisma.productSeoSuggestion.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 's1', ...data }));

      await service.generate('p1');

      expect(prisma.product.update).not.toHaveBeenCalled();
    });
  });

  describe('update/reject', () => {
    it('rejects editing a suggestion that is no longer pending', async () => {
      prisma.productSeoSuggestion.findUnique.mockResolvedValue(buildSuggestion({ status: 'APPROVED' }));
      await expect(service.update('s1', { metaTitle: 'x' })).rejects.toThrow(BadRequestException);
    });

    it('rejects rejecting a suggestion that is no longer pending', async () => {
      prisma.productSeoSuggestion.findUnique.mockResolvedValue(buildSuggestion({ status: 'REJECTED' }));
      await expect(service.reject('s1', 'دلیل')).rejects.toThrow(BadRequestException);
    });

    it('marks a pending suggestion rejected with a reason', async () => {
      const before = buildSuggestion();
      prisma.productSeoSuggestion.findUnique.mockResolvedValue(before);
      prisma.productSeoSuggestion.update.mockResolvedValue({ ...before, status: 'REJECTED', rejectionReason: 'نامناسب' });
      const result = await service.reject('s1', 'نامناسب', 'user1');
      expect(result.status).toBe('REJECTED');
      expect(prisma.product.update).not.toHaveBeenCalled();
    });
  });

  describe('approve', () => {
    it('rejects approving a suggestion that is no longer pending', async () => {
      prisma.productSeoSuggestion.findUnique.mockResolvedValue(buildSuggestion({ status: 'REJECTED' }));
      await expect(service.approve('s1')).rejects.toThrow(BadRequestException);
      expect(prisma.product.update).not.toHaveBeenCalled();
    });

    it('applies metaTitle/metaDescription/searchKeywords/description and image alt text to the live product', async () => {
      const before = buildSuggestion();
      prisma.productSeoSuggestion.findUnique.mockResolvedValue(before);
      prisma.productSeoSuggestion.update.mockResolvedValue({ ...before, status: 'APPROVED' });

      await service.approve('s1', 'user1');

      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: {
          metaTitle: before.metaTitle,
          metaDescription: before.metaDescription,
          searchKeywords: before.searchKeywords,
          description: before.descriptionSuggestion,
        },
      });
      expect(prisma.productImage.update).toHaveBeenCalledWith({ where: { id: 'img1' }, data: { altText: 'تصویر جدید ۱' } });
      expect(auditLog.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'seo.suggestion_approved', entityId: 'p1' }));
    });

    it('never writes Product.name/H1 — h1Suggestion is informational only', async () => {
      const before = buildSuggestion();
      prisma.productSeoSuggestion.findUnique.mockResolvedValue(before);
      prisma.productSeoSuggestion.update.mockResolvedValue({ ...before, status: 'APPROVED' });

      await service.approve('s1');

      const call = prisma.product.update.mock.calls[0][0];
      expect(call.data).not.toHaveProperty('name');
    });

    it('skips product.update entirely when the suggestion has no applicable fields', async () => {
      const before = buildSuggestion({ metaTitle: null, metaDescription: null, searchKeywords: null, descriptionSuggestion: null, altTextSuggestions: {} });
      prisma.productSeoSuggestion.findUnique.mockResolvedValue(before);
      prisma.productSeoSuggestion.update.mockResolvedValue({ ...before, status: 'APPROVED' });

      await service.approve('s1');

      expect(prisma.product.update).not.toHaveBeenCalled();
    });
  });
});
