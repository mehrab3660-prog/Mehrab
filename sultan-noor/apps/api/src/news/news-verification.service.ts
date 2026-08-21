import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';

const DUPLICATE_THRESHOLD = 0.8; // token overlap at/above this = the same story, not just a related one
const GROUP_THRESHOLD = 0.45; // token overlap at/above this = worth grouping for admin review, not a duplicate
const MIN_SUMMARY_LENGTH = 20;

function normalizeTokens(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .normalize('NFKC')
      .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 1),
  );
}

function tokenOverlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  return shared / Math.min(a.size, b.size);
}

function groupKey(tokens: Set<string>): string {
  return [...tokens].sort().slice(0, 4).join('-');
}

// Pure, rule-based checks over real NewsItem rows — no AI. Exact/near-
// duplicate stories are routed to REJECTED (with the original they matched
// recorded via duplicateOfId, kept for audit rather than hard-deleted);
// related-but-distinct stories are only grouped (similarGroupKey) so an
// admin can see them together, never merged or discarded. Nothing here
// invents a fact the source item doesn't already carry — it only flags
// what's uncertain (confidenceNote) for AI_DRAFT/admin review to see.
@Injectable()
export class NewsVerificationService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
  ) {}

  async verify(userId?: string): Promise<{ verified: number; rejectedDuplicates: number }> {
    const candidates = await this.prisma.newsItem.findMany({ where: { status: 'DISCOVERED' }, orderBy: { discoveredAt: 'asc' } });
    const reference = await this.prisma.newsItem.findMany({
      where: { status: { in: ['VERIFIED', 'AI_DRAFT', 'PENDING_REVIEW', 'APPROVED', 'PUBLISHED'] } },
      select: { id: true, rawTitle: true },
    });
    const referenceTokens = reference.map((r) => ({ id: r.id, tokens: normalizeTokens(r.rawTitle) }));

    let verified = 0;
    let rejectedDuplicates = 0;

    for (const item of candidates) {
      const tokens = normalizeTokens(item.rawTitle);

      let bestMatch: { id: string; score: number } | null = null;
      for (const ref of referenceTokens) {
        const score = tokenOverlap(tokens, ref.tokens);
        if (!bestMatch || score > bestMatch.score) bestMatch = { id: ref.id, score };
      }

      if (bestMatch && bestMatch.score >= DUPLICATE_THRESHOLD) {
        await this.prisma.newsItem.update({
          where: { id: item.id },
          data: { status: 'REJECTED', duplicateOfId: bestMatch.id, rejectionReason: `خبر تکراری — مشابه خبر دیگری که قبلاً پردازش شده (شباهت ${Math.round(bestMatch.score * 100)}٪)` },
        });
        rejectedDuplicates++;
        continue;
      }

      const confidenceNotes: string[] = [];
      if (!item.publishedAt) confidenceNotes.push('تاریخ انتشار در منبع مشخص نشده است.');
      if (!item.rawSummary || item.rawSummary.length < MIN_SUMMARY_LENGTH) confidenceNotes.push('خلاصه‌ی منبع بسیار کوتاه یا خالی است — پیش از تأیید نهایی با دقت بیشتری بررسی شود.');

      const similarGroupKey = bestMatch && bestMatch.score >= GROUP_THRESHOLD ? groupKey(tokens) : undefined;

      await this.prisma.newsItem.update({
        where: { id: item.id },
        data: {
          status: 'VERIFIED',
          confidenceNote: confidenceNotes.length ? confidenceNotes.join(' ') : undefined,
          similarGroupKey,
        },
      });
      referenceTokens.push({ id: item.id, tokens });
      verified++;
    }

    await this.auditLog.record({ userId, action: 'news.verification_run', entityType: 'NewsItem', after: { verified, rejectedDuplicates } });
    return { verified, rejectedDuplicates };
  }
}
