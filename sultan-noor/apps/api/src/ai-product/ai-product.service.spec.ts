import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AiProductService } from './ai-product.service';

function buildDraft(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'draft1',
    name: 'کلید مینیاتوری ۱۶ آمپر',
    brandName: 'اشنایدر',
    modelNumber: 'C16',
    ownerPrice: 250000 as any,
    suggestedPrice: null,
    description: 'توضیح آماده‌شده',
    specs: { جریان: '۱۶ آمپر' },
    features: ['قطع سریع اتصال کوتاه'],
    faq: [{ q: 'برای چه مصرفی مناسب است؟', a: 'برای مدار روشنایی خانگی' }],
    seoTitle: 'کلید مینیاتوری ۱۶ آمپر اشنایدر',
    seoDescription: 'خرید کلید مینیاتوری ۱۶ آمپر اشنایدر با قیمت مناسب',
    categoryName: 'کلید و پریز',
    status: 'PENDING_REVIEW',
    ...overrides,
  };
}

describe('AiProductService', () => {
  let prisma: any;
  let settings: any;
  let products: any;
  let auditLog: any;
  let service: AiProductService;
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    prisma = {
      productAiDraft: { create: jest.fn(), update: jest.fn(), findUnique: jest.fn(), findMany: jest.fn() },
      brand: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn(), create: jest.fn() },
      category: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn(), create: jest.fn() },
    };
    settings = { resolve: jest.fn() };
    products = { create: jest.fn() };
    auditLog = { record: jest.fn() };
    service = new AiProductService(prisma, settings, products, auditLog);
    fetchSpy = jest.spyOn(global, 'fetch' as any);
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  describe('prepare', () => {
    it('rejects when no Anthropic key is configured', async () => {
      settings.resolve.mockResolvedValue(undefined);
      await expect(service.prepare({ name: 'محصول', ownerPrice: 1000 })).rejects.toThrow(BadRequestException);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('grounds the prompt in the real input and saves the parsed draft', async () => {
      settings.resolve.mockImplementation((key: string) => Promise.resolve(key === 'anthropicApiKey' ? 'sk-test' : undefined));
      const modelJson = {
        description: 'توضیح تولیدشده',
        specs: { جریان: '۱۶ آمپر' },
        features: ['ویژگی'],
        faq: [{ q: 'س', a: 'ج' }],
        seoTitle: 'عنوان سئو',
        seoDescription: 'توضیح سئو',
        categoryName: 'کلید و پریز',
        suggestedPrice: 260000,
        confidenceNote: 'قیمت فقط تخمینی است',
      };
      fetchSpy.mockResolvedValue({ json: () => Promise.resolve({ content: [{ text: JSON.stringify(modelJson) }] }) } as any);
      prisma.productAiDraft.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'draft1', ...data }));

      const draft = await service.prepare({ name: 'کلید مینیاتوری ۱۶ آمپر', brandName: 'اشنایدر', ownerPrice: 250000 }, 'user1');

      expect(draft.description).toBe('توضیح تولیدشده');
      expect(draft.suggestedPrice).toBe(260000);
      const [, requestInit] = fetchSpy.mock.calls[0];
      const body = JSON.parse(requestInit.body);
      expect(body.messages[0].content).toContain('کلید مینیاتوری ۱۶ آمپر');
      expect(body.messages[0].content).toContain('250000');
      expect(auditLog.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'ai_product.prepare', userId: 'user1' }));
    });

    it('parses fenced JSON and tolerates surrounding prose', async () => {
      settings.resolve.mockImplementation((key: string) => Promise.resolve(key === 'anthropicApiKey' ? 'sk-test' : undefined));
      const fenced = 'اینجا توضیح است:\n```json\n{"description":"متن","specs":{},"features":[],"faq":[],"suggestedPrice":null}\n```';
      fetchSpy.mockResolvedValue({ json: () => Promise.resolve({ content: [{ text: fenced }] }) } as any);
      prisma.productAiDraft.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'draft1', ...data }));

      const draft = await service.prepare({ name: 'محصول', ownerPrice: 1000 });
      expect(draft.description).toBe('متن');
    });

    it('throws BadRequestException instead of a raw error when the AI call fails', async () => {
      settings.resolve.mockImplementation((key: string) => Promise.resolve(key === 'anthropicApiKey' ? 'sk-test' : undefined));
      fetchSpy.mockRejectedValue(new Error('network down'));
      await expect(service.prepare({ name: 'محصول', ownerPrice: 1000 })).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when the model response is not valid JSON', async () => {
      settings.resolve.mockImplementation((key: string) => Promise.resolve(key === 'anthropicApiKey' ? 'sk-test' : undefined));
      fetchSpy.mockResolvedValue({ json: () => Promise.resolve({ content: [{ text: 'not json at all' }] }) } as any);
      await expect(service.prepare({ name: 'محصول', ownerPrice: 1000 })).rejects.toThrow(BadRequestException);
    });
  });

  describe('getDraft', () => {
    it('throws NotFoundException when the draft does not exist', async () => {
      prisma.productAiDraft.findUnique.mockResolvedValue(null);
      await expect(service.getDraft('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('rejects editing a draft that is no longer pending review', async () => {
      prisma.productAiDraft.findUnique.mockResolvedValue(buildDraft({ status: 'APPROVED' }));
      await expect(service.update('draft1', { name: 'نام جدید' })).rejects.toThrow(BadRequestException);
    });

    it('updates a pending draft and logs the change', async () => {
      const before = buildDraft();
      prisma.productAiDraft.findUnique.mockResolvedValue(before);
      prisma.productAiDraft.update.mockResolvedValue({ ...before, name: 'نام جدید' });

      const result = await service.update('draft1', { name: 'نام جدید' }, 'user1');

      expect(result.name).toBe('نام جدید');
      expect(auditLog.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'ai_product.edit', before, userId: 'user1' }));
    });
  });

  describe('reject', () => {
    it('rejects rejecting a draft that is no longer pending review', async () => {
      prisma.productAiDraft.findUnique.mockResolvedValue(buildDraft({ status: 'REJECTED' }));
      await expect(service.reject('draft1', 'دلیل')).rejects.toThrow(BadRequestException);
    });

    it('marks a pending draft as rejected with a reason', async () => {
      const before = buildDraft();
      prisma.productAiDraft.findUnique.mockResolvedValue(before);
      prisma.productAiDraft.update.mockResolvedValue({ ...before, status: 'REJECTED', rejectionReason: 'قیمت غیرمنطقی' });

      const result = await service.reject('draft1', 'قیمت غیرمنطقی', 'user1');

      expect(result.status).toBe('REJECTED');
      expect(auditLog.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'ai_product.reject' }));
    });
  });

  describe('approve', () => {
    it('rejects approving a draft that is no longer pending review', async () => {
      prisma.productAiDraft.findUnique.mockResolvedValue(buildDraft({ status: 'REJECTED' }));
      await expect(service.approve('draft1', {})).rejects.toThrow(BadRequestException);
      expect(products.create).not.toHaveBeenCalled();
    });

    it('creates a real product from the draft, folding specs/features/faq into the description', async () => {
      const before = buildDraft();
      prisma.productAiDraft.findUnique.mockResolvedValue(before);
      prisma.category.findFirst.mockResolvedValue({ id: 'cat1', name: 'کلید و پریز' });
      prisma.brand.findFirst.mockResolvedValue({ id: 'brand1', name: 'اشنایدر' });
      products.create.mockResolvedValue({ id: 'product1', variants: [{ id: 'v1', sku: 'AI-DRAFT1' }] });
      prisma.productAiDraft.update.mockResolvedValue({ ...before, status: 'APPROVED', publishedProductId: 'product1' });

      const result = await service.approve('draft1', { publish: true }, 'user1');

      expect(products.create).toHaveBeenCalledTimes(1);
      const createArg = products.create.mock.calls[0][0];
      expect(createArg.status).toBe('PUBLISHED');
      expect(createArg.categoryId).toBe('cat1');
      expect(createArg.brandId).toBe('brand1');
      expect(createArg.basePrice).toBe(250000);
      expect(createArg.description).toContain('توضیح آماده‌شده');
      expect(createArg.description).toContain('مشخصات فنی');
      expect(createArg.description).toContain('جریان: ۱۶ آمپر');
      expect(createArg.description).toContain('ویژگی‌ها');
      expect(createArg.description).toContain('پرسش‌های متداول');

      expect(result.product.id).toBe('product1');
      expect(prisma.productAiDraft.update).toHaveBeenCalledWith({
        where: { id: 'draft1' },
        data: expect.objectContaining({ status: 'APPROVED', publishedProductId: 'product1', reviewedByUserId: 'user1' }),
      });
      expect(auditLog.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'ai_product.approve' }));
    });

    it('saves as a hidden draft product when publish is false', async () => {
      const before = buildDraft({ categoryName: null, brandName: null });
      prisma.productAiDraft.findUnique.mockResolvedValue(before);
      products.create.mockResolvedValue({ id: 'product2', variants: [{ id: 'v1', sku: 'AI-DRAFT1' }] });
      prisma.productAiDraft.update.mockResolvedValue({ ...before, status: 'APPROVED', publishedProductId: 'product2' });

      await service.approve('draft1', { publish: false });

      const createArg = products.create.mock.calls[0][0];
      expect(createArg.status).toBe('DRAFT');
      expect(createArg.categoryId).toBeUndefined();
      expect(createArg.brandId).toBeUndefined();
    });

    it('reuses an existing category/brand by name instead of creating a duplicate', async () => {
      const before = buildDraft();
      prisma.productAiDraft.findUnique.mockResolvedValue(before);
      prisma.category.findFirst.mockResolvedValue({ id: 'cat1', name: 'کلید و پریز' });
      prisma.brand.findFirst.mockResolvedValue({ id: 'brand1', name: 'اشنایدر' });
      products.create.mockResolvedValue({ id: 'product1', variants: [] });
      prisma.productAiDraft.update.mockResolvedValue({ ...before, status: 'APPROVED' });

      await service.approve('draft1', {});

      expect(prisma.category.create).not.toHaveBeenCalled();
      expect(prisma.brand.create).not.toHaveBeenCalled();
    });
  });
});
