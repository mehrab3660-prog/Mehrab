import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';
import { fetchImageSafely } from '../ai-image/util/safe-image-fetch';
import { parseFeed } from './util/feed-parser';
import { CreateNewsSourceDto, UpdateNewsSourceDto } from './dto/news.dto';

const MAX_ITEMS_PER_SOURCE = 30;

// Only ever GETs a feed URL the admin themselves configured — a plain RSS/
// Atom fetch, exactly what those feeds are published for. No HTML scraping,
// no headless browser, no login/paywall bypass, and the same SSRF-hardened
// transport (DNS-pinned, private-IP-blocked, size-capped) Sprint 2's image
// pipeline already uses — reused as-is rather than rebuilt.
@Injectable()
export class NewsSourceService {
  private readonly logger = new Logger(NewsSourceService.name);

  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
  ) {}

  list() {
    return this.prisma.newsSource.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async create(dto: CreateNewsSourceDto, userId?: string) {
    const source = await this.prisma.newsSource.create({ data: dto });
    await this.auditLog.record({ userId, action: 'news.source_created', entityType: 'NewsSource', entityId: source.id, after: source });
    return source;
  }

  async update(id: string, dto: UpdateNewsSourceDto, userId?: string) {
    const before = await this.prisma.newsSource.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('منبع خبری یافت نشد');
    const source = await this.prisma.newsSource.update({ where: { id }, data: dto });
    await this.auditLog.record({ userId, action: 'news.source_updated', entityType: 'NewsSource', entityId: id, before, after: source });
    return source;
  }

  async remove(id: string, userId?: string) {
    const before = await this.prisma.newsSource.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('منبع خبری یافت نشد');
    await this.prisma.newsSource.delete({ where: { id } });
    await this.auditLog.record({ userId, action: 'news.source_removed', entityType: 'NewsSource', entityId: id, before });
    return { success: true };
  }

  // Fetches every active source's feed, parses it, and creates a DISCOVERED
  // NewsItem for each entry not already known (by an exact hash of its real
  // article URL) — never invents an item, never touches a page beyond the
  // feed URL itself. Returns how many new items were actually discovered
  // per source, including sources that failed to fetch (0, not an error
  // that would break the whole run — one bad feed must never block the rest).
  async discover(userId?: string): Promise<{ sourceId: string; sourceName: string; discovered: number; error?: string }[]> {
    const sources = await this.prisma.newsSource.findMany({ where: { isActive: true } });
    const results: { sourceId: string; sourceName: string; discovered: number; error?: string }[] = [];

    for (const source of sources) {
      try {
        const { buffer } = await fetchImageSafely(source.feedUrl);
        const items = parseFeed(buffer.toString('utf8'), MAX_ITEMS_PER_SOURCE);

        let discovered = 0;
        for (const item of items) {
          const contentHash = createHash('sha256').update(item.link).digest('hex');
          const existing = await this.prisma.newsItem.findFirst({ where: { contentHash } });
          if (existing) continue;

          await this.prisma.newsItem.create({
            data: {
              sourceId: source.id,
              sourceName: source.name,
              sourceUrl: item.link,
              contentHash,
              rawTitle: item.title,
              rawSummary: item.summary ?? undefined,
              publishedAt: item.publishedAt ?? undefined,
              imageUrl: item.imageUrl ?? undefined,
              imageSource: item.imageUrl ? 'SOURCE' : undefined,
              status: 'DISCOVERED',
            },
          });
          discovered++;
        }

        results.push({ sourceId: source.id, sourceName: source.name, discovered });
      } catch (err) {
        this.logger.warn(`News discovery failed for source ${source.name}: ${(err as Error).message}`);
        results.push({ sourceId: source.id, sourceName: source.name, discovered: 0, error: (err as Error).message });
      }
    }

    const totalDiscovered = results.reduce((sum, r) => sum + r.discovered, 0);
    await this.auditLog.record({ userId, action: 'news.discovery_run', entityType: 'NewsSource', after: { totalDiscovered, results } });
    return results;
  }
}
