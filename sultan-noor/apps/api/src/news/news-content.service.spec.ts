import { BadRequestException, NotFoundException } from '@nestjs/common';
import { NewsContentService } from './news-content.service';

function buildItem(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'n1',
    sourceName: 'منبع تست',
    sourceUrl: 'https://example.com/a',
    rawTitle: 'خبر تست',
    rawSummary: 'خلاصه تست',
    publishedAt: new Date(),
    status: 'VERIFIED',
    imageUrl: null,
    confidenceNote: null,
    draftTitle: null,
    draftBody: null,
    imageUrl_: undefined,
    ...overrides,
  };
}

describe('NewsContentService', () => {
  let prisma: any;
  let settings: any;
  let auditLog: any;
  let aiUsage: any;
  let newsImage: any;
  let blog: any;
  let service: NewsContentService;
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    prisma = {
      newsItem: { findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    };
    settings = { resolve: jest.fn() };
    auditLog = { record: jest.fn() };
    aiUsage = { checkBudget: jest.fn().mockResolvedValue(true), record: jest.fn() };
    newsImage = { resolveImage: jest.fn().mockResolvedValue(null) };
    blog = { create: jest.fn(), update: jest.fn() };
    service = new NewsContentService(prisma, settings, auditLog, aiUsage, newsImage, blog);
    fetchSpy = jest.spyOn(global, 'fetch' as any);
  });

  afterEach(() => fetchSpy.mockRestore());

  describe('generateDraft', () => {
    it('fails gracefully with no API key configured', async () => {
      settings.resolve.mockResolvedValue(undefined);
      await expect(service.generateDraft('n1')).rejects.toThrow(BadRequestException);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('only accepts VERIFIED items — never drafts a raw, unverified discovery', async () => {
      settings.resolve.mockResolvedValue('key');
      prisma.newsItem.findUnique.mockResolvedValue(buildItem({ status: 'DISCOVERED' }));
      await expect(service.generateDraft('n1')).rejects.toThrow(BadRequestException);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('refuses once the monthly news budget is exhausted', async () => {
      settings.resolve.mockResolvedValue('key');
      prisma.newsItem.findUnique.mockResolvedValue(buildItem());
      aiUsage.checkBudget.mockResolvedValue(false);
      await expect(service.generateDraft('n1')).rejects.toThrow(BadRequestException);
    });

    it('grounds the AI call strictly in this one real item — never fabricates confirmingSources when the model returns none', async () => {
      settings.resolve.mockResolvedValue('key');
      prisma.newsItem.findUnique.mockResolvedValue(buildItem());
      fetchSpy.mockResolvedValue({
        json: () =>
          Promise.resolve({
            content: [{ text: JSON.stringify({ title: 'عنوان بازنویسی‌شده', body: 'متن کامل', category: 'روشنایی', tags: 'برق', confirmingSources: [] }) }],
          }),
      } as any);
      prisma.newsItem.update.mockResolvedValue(buildItem({ status: 'PENDING_REVIEW' }));

      await service.generateDraft('n1', 'user1', 'https://api.sultan-noor.com');

      const data = prisma.newsItem.update.mock.calls[0][0].data;
      expect(data.status).toBe('PENDING_REVIEW');
      expect(data.confirmingSources).toEqual([]);
      expect(data.draftTitle).toBe('عنوان بازنویسی‌شده');

      const promptContent = JSON.parse(fetchSpy.mock.calls[0][1].body).messages[0].content;
      expect(promptContent).toContain('خبر تست'); // the real source title, nothing invented
      expect(promptContent).toContain('https://example.com/a'); // the real source URL
    });

    it('logs failed usage and surfaces a graceful error when the AI call itself fails', async () => {
      settings.resolve.mockResolvedValue('key');
      prisma.newsItem.findUnique.mockResolvedValue(buildItem());
      fetchSpy.mockRejectedValue(new Error('network down'));

      await expect(service.generateDraft('n1')).rejects.toThrow(BadRequestException);
      expect(aiUsage.record).toHaveBeenCalledWith('n1', false, expect.any(Number));
    });
  });

  describe('approval workflow', () => {
    it('rejects editing/approving/rejecting anything not PENDING_REVIEW', async () => {
      prisma.newsItem.findUnique.mockResolvedValue(buildItem({ status: 'APPROVED' }));
      await expect(service.update('n1', { draftTitle: 'x' })).rejects.toThrow(BadRequestException);
      await expect(service.reject('n1', 'دلیل')).rejects.toThrow(BadRequestException);
      await expect(service.approve('n1')).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException for a news item that does not exist', async () => {
      prisma.newsItem.findUnique.mockResolvedValue(null);
      await expect(service.getById('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('publish', () => {
    it('requires a real draft title and body before publishing anything', async () => {
      prisma.newsItem.findUnique.mockResolvedValue(buildItem({ status: 'PENDING_REVIEW', draftTitle: null, draftBody: null }));
      await expect(service.publish('n1')).rejects.toThrow(BadRequestException);
      expect(blog.create).not.toHaveBeenCalled();
    });

    it('publishes through the real, existing BlogService — not a second content system', async () => {
      prisma.newsItem.findUnique.mockResolvedValue(
        buildItem({ status: 'PENDING_REVIEW', draftTitle: 'عنوان نهایی', draftBody: 'متن نهایی', category: 'روشنایی', tags: 'برق, خبر' }),
      );
      blog.create.mockResolvedValue({ id: 'post1' });
      prisma.newsItem.update.mockResolvedValue(buildItem({ status: 'PUBLISHED' }));

      await service.publish('n1', 'user1');

      expect(blog.create).toHaveBeenCalledWith('user1', expect.objectContaining({ title: 'عنوان نهایی', content: 'متن نهایی', category: 'روشنایی', tags: 'برق, خبر' }));
      expect(blog.update).toHaveBeenCalledWith('post1', { isPublished: true });
      expect(prisma.newsItem.update).toHaveBeenCalledWith({
        where: { id: 'n1' },
        data: expect.objectContaining({ status: 'PUBLISHED', publishedBlogPostId: 'post1' }),
      });
    });

    it('also publishes a previously-APPROVED (saved-as-draft) item', async () => {
      prisma.newsItem.findUnique.mockResolvedValue(buildItem({ status: 'APPROVED', draftTitle: 'عنوان', draftBody: 'متن' }));
      blog.create.mockResolvedValue({ id: 'post2' });
      prisma.newsItem.update.mockResolvedValue(buildItem({ status: 'PUBLISHED' }));

      await service.publish('n1');
      expect(blog.create).toHaveBeenCalled();
    });
  });
});
