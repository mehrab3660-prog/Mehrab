import { NewsSourceService } from './news-source.service';
import * as safeFetch from '../ai-image/util/safe-image-fetch';

const SAMPLE_RSS = `<?xml version="1.0"?>
<rss><channel>
  <item>
    <title>UPS جدید برای نیروگاه‌های خورشیدی معرفی شد</title>
    <link>https://example.com/news/ups-solar</link>
    <description>یک شرکت معتبر یک UPS جدید معرفی کرد.</description>
    <pubDate>Mon, 10 Aug 2026 08:00:00 GMT</pubDate>
  </item>
  <item>
    <title>استاندارد جدید ایمنی برق ساختمان</title>
    <link>https://example.com/news/safety-standard</link>
    <description>استاندارد تازه‌ای اعلام شد.</description>
    <pubDate>Tue, 11 Aug 2026 08:00:00 GMT</pubDate>
  </item>
</channel></rss>`;

describe('NewsSourceService', () => {
  let prisma: any;
  let auditLog: any;
  let service: NewsSourceService;
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    prisma = {
      newsSource: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
      newsItem: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({}) },
    };
    auditLog = { record: jest.fn() };
    service = new NewsSourceService(prisma, auditLog);
    fetchSpy = jest.spyOn(safeFetch, 'fetchImageSafely');
  });

  afterEach(() => fetchSpy.mockRestore());

  describe('discover', () => {
    it('creates a real DISCOVERED NewsItem per new feed entry, never fabricating fields the feed did not provide', async () => {
      prisma.newsSource.findMany.mockResolvedValue([{ id: 's1', name: 'منبع تست', feedUrl: 'https://example.com/rss.xml', isActive: true }]);
      fetchSpy.mockResolvedValue({ buffer: Buffer.from(SAMPLE_RSS, 'utf8'), contentType: 'application/rss+xml', finalUrl: 'https://example.com/rss.xml' });

      const results = await service.discover('user1');

      expect(results).toEqual([{ sourceId: 's1', sourceName: 'منبع تست', discovered: 2 }]);
      expect(prisma.newsItem.create).toHaveBeenCalledTimes(2);
      const firstCall = prisma.newsItem.create.mock.calls[0][0].data;
      expect(firstCall).toEqual(
        expect.objectContaining({
          sourceId: 's1',
          sourceName: 'منبع تست',
          sourceUrl: 'https://example.com/news/ups-solar',
          rawTitle: 'UPS جدید برای نیروگاه‌های خورشیدی معرفی شد',
          status: 'DISCOVERED',
        }),
      );
    });

    it('never creates a duplicate NewsItem for a URL already known', async () => {
      prisma.newsSource.findMany.mockResolvedValue([{ id: 's1', name: 'منبع تست', feedUrl: 'https://example.com/rss.xml', isActive: true }]);
      fetchSpy.mockResolvedValue({ buffer: Buffer.from(SAMPLE_RSS, 'utf8'), contentType: 'application/rss+xml', finalUrl: 'https://example.com/rss.xml' });
      prisma.newsItem.findFirst.mockResolvedValue({ id: 'existing' });

      const results = await service.discover();

      expect(results[0].discovered).toBe(0);
      expect(prisma.newsItem.create).not.toHaveBeenCalled();
    });

    it('never lets one failing source break discovery for the others', async () => {
      prisma.newsSource.findMany.mockResolvedValue([
        { id: 's1', name: 'منبع خراب', feedUrl: 'https://broken.example.com/rss.xml', isActive: true },
        { id: 's2', name: 'منبع سالم', feedUrl: 'https://ok.example.com/rss.xml', isActive: true },
      ]);
      fetchSpy.mockImplementation(async (url: string) => {
        if (url.includes('broken')) throw new Error('connection refused');
        return { buffer: Buffer.from(SAMPLE_RSS, 'utf8'), contentType: 'application/rss+xml', finalUrl: url };
      });

      const results = await service.discover();

      expect(results[0]).toEqual(expect.objectContaining({ sourceId: 's1', discovered: 0, error: expect.any(String) }));
      expect(results[1]).toEqual(expect.objectContaining({ sourceId: 's2', discovered: 2 }));
    });

    it('only ever fetches sources the admin marked active', async () => {
      await service.discover();
      expect(prisma.newsSource.findMany).toHaveBeenCalledWith({ where: { isActive: true } });
    });
  });
});
