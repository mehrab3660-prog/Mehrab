import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ContentAutopilotService } from './content-autopilot.service';

function buildDraft(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'd1',
    type: 'BLOG_POST',
    topic: 'انتخاب کلید مینیاتوری مناسب',
    keywords: null,
    title: 'راهنمای انتخاب کلید مینیاتوری',
    excerpt: 'خلاصه',
    body: 'متن کامل مقاله',
    faq: [{ q: 'س', a: 'ج' }],
    metaTitle: 'عنوان سئو',
    metaDescription: 'توضیح متا',
    suggestedImagePrompt: 'یک کلید مینیاتوری روی دیوار',
    internalLinks: [],
    sources: ['دانش عمومی'],
    productId: null,
    categoryId: null,
    status: 'PENDING_REVIEW',
    ...overrides,
  };
}

describe('ContentAutopilotService', () => {
  let prisma: any;
  let settings: any;
  let auditLog: any;
  let aiUsage: any;
  let blog: any;
  let products: any;
  let service: ContentAutopilotService;
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    prisma = {
      contentDraft: { create: jest.fn(), update: jest.fn(), findUnique: jest.fn(), findMany: jest.fn() },
      product: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
      category: { findUnique: jest.fn(), update: jest.fn() },
      blogPost: { findMany: jest.fn().mockResolvedValue([]) },
    };
    settings = { resolve: jest.fn() };
    auditLog = { record: jest.fn() };
    aiUsage = { checkBudget: jest.fn().mockResolvedValue(true), record: jest.fn() };
    blog = { create: jest.fn(), update: jest.fn() };
    products = { frequentlyBoughtWith: jest.fn().mockResolvedValue([]) };
    service = new ContentAutopilotService(prisma, settings, auditLog, aiUsage, blog, products);
    fetchSpy = jest.spyOn(global, 'fetch' as any);
  });

  afterEach(() => fetchSpy.mockRestore());

  describe('generate', () => {
    it('rejects PRODUCT_INTRO with no productId before ever calling the AI', async () => {
      await expect(service.generate({ type: 'PRODUCT_INTRO' as any, topic: 'x' })).rejects.toThrow(BadRequestException);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('rejects CATEGORY_CONTENT with no categoryId before ever calling the AI', async () => {
      await expect(service.generate({ type: 'CATEGORY_CONTENT' as any, topic: 'x' })).rejects.toThrow(BadRequestException);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('rejects when no Anthropic key is configured', async () => {
      settings.resolve.mockResolvedValue(undefined);
      await expect(service.generate({ type: 'BLOG_POST' as any, topic: 'x' })).rejects.toThrow(BadRequestException);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('rejects when the monthly budget is exhausted', async () => {
      settings.resolve.mockImplementation((k: string) => Promise.resolve(k === 'anthropicApiKey' ? 'sk' : undefined));
      aiUsage.checkBudget.mockResolvedValue(false);
      await expect(service.generate({ type: 'BLOG_POST' as any, topic: 'x' })).rejects.toThrow(BadRequestException);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('grounds the prompt in real product data when productId is given', async () => {
      settings.resolve.mockImplementation((k: string) => Promise.resolve(k === 'anthropicApiKey' ? 'sk' : undefined));
      prisma.product.findUnique.mockResolvedValue({ name: 'کلید مینیاتوری C16', description: 'توضیح', basePrice: 250000 as any, brand: { name: 'اشنایدر' }, category: { name: 'کلید و پریز' } });
      fetchSpy.mockResolvedValue({ json: () => Promise.resolve({ content: [{ text: JSON.stringify({ title: 't', body: 'b' }) }] }) } as any);
      prisma.contentDraft.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'd1', ...data }));

      await service.generate({ type: 'PRODUCT_INTRO' as any, topic: 'معرفی محصول', productId: 'p1' }, 'user1');

      const [, requestInit] = fetchSpy.mock.calls[0];
      const body = JSON.parse(requestInit.body);
      expect(body.messages[0].content).toContain('کلید مینیاتوری C16');
      expect(body.messages[0].content).toContain('اشنایدر');
    });

    it('drops any internalLink the model proposes that is not in the real allow-list', async () => {
      settings.resolve.mockImplementation((k: string) => Promise.resolve(k === 'anthropicApiKey' ? 'sk' : undefined));
      prisma.blogPost.findMany.mockResolvedValue([{ title: 'مقاله واقعی', slug: 'real-article' }]);
      const modelJson = {
        title: 't',
        body: 'b',
        internalLinks: [
          { label: 'مقاله واقعی', url: '/blog/real-article' },
          { label: 'جعلی', url: '/blog/fake-article' },
        ],
      };
      fetchSpy.mockResolvedValue({ json: () => Promise.resolve({ content: [{ text: JSON.stringify(modelJson) }] }) } as any);
      prisma.contentDraft.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'd1', ...data }));

      const draft = await service.generate({ type: 'BLOG_POST' as any, topic: 'x' });

      expect(draft.internalLinks).toEqual([{ label: 'مقاله واقعی', url: '/blog/real-article' }]);
    });

    it('reuses the real frequentlyBoughtWith algorithm for complementary-product links, not a fabricated list', async () => {
      settings.resolve.mockImplementation((k: string) => Promise.resolve(k === 'anthropicApiKey' ? 'sk' : undefined));
      products.frequentlyBoughtWith.mockResolvedValue([{ name: 'پریز برق', slug: 'outlet' }]);
      fetchSpy.mockResolvedValue({ json: () => Promise.resolve({ content: [{ text: JSON.stringify({ title: 't', body: 'b' }) }] }) } as any);
      prisma.contentDraft.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'd1', ...data }));

      await service.generate({ type: 'BLOG_POST' as any, topic: 'x', productId: 'p1' });

      expect(products.frequentlyBoughtWith).toHaveBeenCalledWith('p1', 5);
      const [, requestInit] = fetchSpy.mock.calls[0];
      const body = JSON.parse(requestInit.body);
      expect(body.messages[0].content).toContain('/products/outlet');
    });

    it('records a failed usage entry and throws BadRequestException on API failure', async () => {
      settings.resolve.mockImplementation((k: string) => Promise.resolve(k === 'anthropicApiKey' ? 'sk' : undefined));
      fetchSpy.mockRejectedValue(new Error('network down'));
      await expect(service.generate({ type: 'BLOG_POST' as any, topic: 'x' })).rejects.toThrow(BadRequestException);
      expect(aiUsage.record).toHaveBeenCalledWith('content-generation', undefined, false, expect.any(Number));
    });
  });

  describe('getDraft', () => {
    it('throws NotFoundException for a missing draft', async () => {
      prisma.contentDraft.findUnique.mockResolvedValue(null);
      await expect(service.getDraft('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update/reject', () => {
    it('rejects editing a draft that is no longer pending review', async () => {
      prisma.contentDraft.findUnique.mockResolvedValue(buildDraft({ status: 'APPROVED' }));
      await expect(service.update('d1', { title: 'x' })).rejects.toThrow(BadRequestException);
    });

    it('rejects rejecting a draft that is no longer pending review', async () => {
      prisma.contentDraft.findUnique.mockResolvedValue(buildDraft({ status: 'REJECTED' }));
      await expect(service.reject('d1', 'دلیل')).rejects.toThrow(BadRequestException);
    });
  });

  describe('approve — "ذخیره به‌عنوان پیش‌نویس" (publish: false)', () => {
    it('marks APPROVED without ever touching BlogPost/Product/Category', async () => {
      const before = buildDraft();
      prisma.contentDraft.findUnique.mockResolvedValue(before);
      prisma.contentDraft.update.mockResolvedValue({ ...before, status: 'APPROVED' });

      const result = await service.approve('d1', { publish: false }, 'user1');

      expect(result.status).toBe('APPROVED');
      expect(blog.create).not.toHaveBeenCalled();
      expect(prisma.product.update).not.toHaveBeenCalled();
      expect(prisma.category.update).not.toHaveBeenCalled();
      expect(auditLog.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'content.approved_as_draft' }));
    });

    // Regression: `publish` is a DTO-only flag, not a ContentDraft column.
    // A real Prisma client throws a validation error if it leaks into
    // `update({ data })` — a plain jest mock does not, so this must be
    // asserted explicitly rather than relying on the mock to catch it.
    it('never leaks the DTO-only `publish` flag into the Prisma update data', async () => {
      const before = buildDraft();
      prisma.contentDraft.findUnique.mockResolvedValue(before);
      prisma.contentDraft.update.mockResolvedValue({ ...before, status: 'APPROVED' });

      await service.approve('d1', { publish: false }, 'user1');

      const data = prisma.contentDraft.update.mock.calls[0][0].data;
      expect(data).not.toHaveProperty('publish');
    });
  });

  describe('approve — "تأیید و انتشار" (publish: true)', () => {
    it('publishes a blog-like draft as a real BlogPost through the existing BlogService, not a second system', async () => {
      const before = buildDraft();
      prisma.contentDraft.findUnique.mockResolvedValue(before);
      blog.create.mockResolvedValue({ id: 'post1' });
      prisma.contentDraft.update.mockResolvedValue({ ...before, status: 'PUBLISHED', publishedBlogPostId: 'post1' });

      await service.approve('d1', { publish: true }, 'user1');

      expect(blog.create).toHaveBeenCalledWith('user1', expect.objectContaining({ title: before.title, content: before.body }));
      expect(blog.update).toHaveBeenCalledWith('post1', { isPublished: true });
      expect(prisma.contentDraft.update).toHaveBeenCalledWith({
        where: { id: 'd1' },
        data: expect.objectContaining({ status: 'PUBLISHED', publishedBlogPostId: 'post1' }),
      });
    });

    it('publishes a PRODUCT_INTRO by writing into the real Product.description — no BlogPost created', async () => {
      const before = buildDraft({ type: 'PRODUCT_INTRO', productId: 'p1', body: 'توضیح جدید محصول' });
      prisma.contentDraft.findUnique.mockResolvedValue(before);
      prisma.contentDraft.update.mockResolvedValue({ ...before, status: 'PUBLISHED' });

      await service.approve('d1', { publish: true });

      expect(prisma.product.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { description: 'توضیح جدید محصول' } });
      expect(blog.create).not.toHaveBeenCalled();
    });

    it('publishes CATEGORY_CONTENT by writing into the real Category.description', async () => {
      const before = buildDraft({ type: 'CATEGORY_CONTENT', categoryId: 'c1', body: 'توضیح جدید دسته' });
      prisma.contentDraft.findUnique.mockResolvedValue(before);
      prisma.contentDraft.update.mockResolvedValue({ ...before, status: 'PUBLISHED' });

      await service.approve('d1', { publish: true });

      expect(prisma.category.update).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { description: 'توضیح جدید دسته' } });
      expect(blog.create).not.toHaveBeenCalled();
    });

    it('rejects approving a draft that is no longer pending review', async () => {
      prisma.contentDraft.findUnique.mockResolvedValue(buildDraft({ status: 'REJECTED' }));
      await expect(service.approve('d1', { publish: true })).rejects.toThrow(BadRequestException);
      expect(blog.create).not.toHaveBeenCalled();
    });

    // Regression: same as the publish:false case above, but for the
    // publish:true branch — this crashed against the real Prisma client
    // in a live smoke test even though the mocked-Prisma unit tests above
    // all passed, since a jest mock silently accepts unknown fields.
    it('never leaks the DTO-only `publish` flag into the Prisma update data', async () => {
      const before = buildDraft();
      prisma.contentDraft.findUnique.mockResolvedValue(before);
      blog.create.mockResolvedValue({ id: 'post1' });
      prisma.contentDraft.update.mockResolvedValue({ ...before, status: 'PUBLISHED', publishedBlogPostId: 'post1' });

      await service.approve('d1', { publish: true }, 'user1');

      const data = prisma.contentDraft.update.mock.calls[0][0].data;
      expect(data).not.toHaveProperty('publish');
    });
  });

  describe('publish — promoting a saved-as-draft (APPROVED) content item', () => {
    it('rejects promoting a draft that is not APPROVED yet', async () => {
      prisma.contentDraft.findUnique.mockResolvedValue(buildDraft({ status: 'PENDING_REVIEW' }));
      await expect(service.publish('d1')).rejects.toThrow(BadRequestException);
    });

    it('publishes an APPROVED draft and marks it PUBLISHED', async () => {
      const before = buildDraft({ status: 'APPROVED' });
      prisma.contentDraft.findUnique.mockResolvedValue(before);
      blog.create.mockResolvedValue({ id: 'post1' });
      prisma.contentDraft.update.mockResolvedValue({ ...before, status: 'PUBLISHED' });

      await service.publish('d1', 'user1');

      expect(blog.create).toHaveBeenCalled();
      expect(prisma.contentDraft.update).toHaveBeenCalledWith({
        where: { id: 'd1' },
        data: expect.objectContaining({ status: 'PUBLISHED', publishedBlogPostId: 'post1' }),
      });
    });
  });
});
