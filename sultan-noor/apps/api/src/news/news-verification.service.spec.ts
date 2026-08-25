import { NewsVerificationService } from './news-verification.service';

function item(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'n1',
    rawTitle: 'UPS جدید برای نیروگاه خورشیدی معرفی شد',
    rawSummary: 'یک شرکت معتبر یک محصول تازه معرفی کرد که ظرفیت بالایی دارد.',
    publishedAt: new Date(),
    discoveredAt: new Date(),
    ...overrides,
  };
}

describe('NewsVerificationService', () => {
  let prisma: any;
  let auditLog: any;
  let service: NewsVerificationService;

  beforeEach(() => {
    prisma = {
      newsItem: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn().mockResolvedValue({}) },
    };
    auditLog = { record: jest.fn() };
    service = new NewsVerificationService(prisma, auditLog);
  });

  it('promotes a real, well-formed item straight to VERIFIED with no confidence note', async () => {
    prisma.newsItem.findMany.mockResolvedValueOnce([item()]).mockResolvedValueOnce([]);

    await service.verify();

    expect(prisma.newsItem.update).toHaveBeenCalledWith({
      where: { id: 'n1' },
      data: { status: 'VERIFIED', confidenceNote: undefined, similarGroupKey: undefined },
    });
  });

  it('flags — never guesses — a missing publish date and a too-short summary', async () => {
    prisma.newsItem.findMany.mockResolvedValueOnce([item({ publishedAt: null, rawSummary: 'کوتاه' })]).mockResolvedValueOnce([]);

    await service.verify();

    const data = prisma.newsItem.update.mock.calls[0][0].data;
    expect(data.status).toBe('VERIFIED');
    expect(data.confidenceNote).toContain('تاریخ انتشار');
    expect(data.confidenceNote).toContain('خلاصه');
  });

  it('routes a near-duplicate story to REJECTED with the original recorded, never silently discarding it', async () => {
    const original = { id: 'original', rawTitle: 'UPS جدید برای نیروگاه خورشیدی معرفی شد' };
    prisma.newsItem.findMany
      .mockResolvedValueOnce([item({ id: 'dup', rawTitle: 'UPS جدید برای نیروگاه خورشیدی معرفی شد' })]) // candidates
      .mockResolvedValueOnce([original]); // reference (already-verified items)

    const result = await service.verify();

    expect(result.rejectedDuplicates).toBe(1);
    expect(prisma.newsItem.update).toHaveBeenCalledWith({
      where: { id: 'dup' },
      data: expect.objectContaining({ status: 'REJECTED', duplicateOfId: 'original' }),
    });
  });

  it('groups a related-but-distinct story instead of rejecting or merging it', async () => {
    const reference = { id: 'ref1', rawTitle: 'خودرو برقی جدید با شارژر سریع عرضه شد در بازار داخلی' };
    prisma.newsItem.findMany
      .mockResolvedValueOnce([item({ id: 'related', rawTitle: 'شارژر سریع خودرو برقی در ایران عرضه شد امسال' })])
      .mockResolvedValueOnce([reference]);

    await service.verify();

    expect(prisma.newsItem.update).toHaveBeenCalledWith({
      where: { id: 'related' },
      data: expect.objectContaining({ status: 'VERIFIED', similarGroupKey: expect.any(String) }),
    });
    // never rejected as a duplicate
    expect(prisma.newsItem.update).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'REJECTED' }) }));
  });
});
