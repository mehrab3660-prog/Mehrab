import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { REAL_SALE_STATUSES } from '../common/constants/order-status';

// Fixed, documented thresholds — the same numbers every time a segment is
// computed, never a per-customer guess. B2B always wins regardless of
// recency (customerType is real, always-known account data, not inferred).
export const NEW_WINDOW_DAYS = 30;
export const ACTIVE_WINDOW_DAYS = 60;
export const INACTIVE_WINDOW_DAYS = 120;
export const LOYAL_MIN_ORDERS = 5;

export type CustomerSegment = 'B2B' | 'NEW' | 'LOYAL' | 'ACTIVE' | 'LOW_ACTIVITY' | 'INACTIVE' | 'NO_ORDERS';

export interface CustomerSummary {
  userId: string;
  fullName: string | null;
  phone: string;
  customerType: 'RETAIL' | 'WHOLESALE';
  orderCount: number;
  totalSpend: number;
  lastOrderAt: Date | null;
  segment: CustomerSegment;
}

// AI never guesses about a customer it has no order data for — a user with
// zero real (paid/shipped/delivered) orders is always NO_ORDERS, regardless
// of how long ago the account was created.
export function classifySegment(input: {
  customerType: 'RETAIL' | 'WHOLESALE';
  orderCount: number;
  totalSpend: number;
  lastOrderAt: Date | null;
  firstOrderAt: Date | null;
}): CustomerSegment {
  if (input.customerType === 'WHOLESALE') return 'B2B';
  if (input.orderCount === 0 || !input.lastOrderAt) return 'NO_ORDERS';

  const now = new Date();
  const daysSinceLast = (now.getTime() - input.lastOrderAt.getTime()) / (24 * 60 * 60 * 1000);
  const daysSinceFirst = input.firstOrderAt ? (now.getTime() - input.firstOrderAt.getTime()) / (24 * 60 * 60 * 1000) : Infinity;

  if (input.orderCount === 1 && daysSinceFirst <= NEW_WINDOW_DAYS) return 'NEW';
  if (daysSinceLast > INACTIVE_WINDOW_DAYS) return 'INACTIVE';
  if (daysSinceLast > ACTIVE_WINDOW_DAYS) return 'LOW_ACTIVITY';
  if (input.orderCount >= LOYAL_MIN_ORDERS) return 'LOYAL';
  return 'ACTIVE';
}

// Real Order-data-driven CRM segmentation (Sprint 8 §3) — no AI, no
// guessing. Two bulk queries regardless of customer count (a groupBy for
// order aggregates, a findMany for user rows), then an in-memory join —
// deliberately avoids per-customer N+1 queries (§18 performance). Only
// REAL_SALE_STATUSES orders count as a real purchase, same convention as
// every other analytics service in this codebase.
@Injectable()
export class CustomerSegmentationService {
  constructor(private prisma: PrismaService) {}

  private async orderAggregatesByUser(): Promise<Map<string, { orderCount: number; totalSpend: number; lastOrderAt: Date; firstOrderAt: Date }>> {
    const orders = await this.prisma.order.findMany({
      where: { status: { in: REAL_SALE_STATUSES } },
      select: { userId: true, grandTotal: true, createdAt: true },
    });
    const map = new Map<string, { orderCount: number; totalSpend: number; lastOrderAt: Date; firstOrderAt: Date }>();
    for (const o of orders) {
      const entry = map.get(o.userId) ?? { orderCount: 0, totalSpend: 0, lastOrderAt: o.createdAt, firstOrderAt: o.createdAt };
      entry.orderCount += 1;
      entry.totalSpend += Number(o.grandTotal);
      if (o.createdAt > entry.lastOrderAt) entry.lastOrderAt = o.createdAt;
      if (o.createdAt < entry.firstOrderAt) entry.firstOrderAt = o.createdAt;
      map.set(o.userId, entry);
    }
    return map;
  }

  async summarize(userIds?: string[]): Promise<CustomerSummary[]> {
    const [users, aggregates] = await Promise.all([
      this.prisma.user.findMany({
        where: { role: 'CUSTOMER', ...(userIds ? { id: { in: userIds } } : {}) },
        select: { id: true, fullName: true, phone: true, customerType: true },
      }),
      this.orderAggregatesByUser(),
    ]);

    return users.map((u) => {
      const agg = aggregates.get(u.id);
      const segment = classifySegment({
        customerType: u.customerType,
        orderCount: agg?.orderCount ?? 0,
        totalSpend: agg?.totalSpend ?? 0,
        lastOrderAt: agg?.lastOrderAt ?? null,
        firstOrderAt: agg?.firstOrderAt ?? null,
      });
      return {
        userId: u.id,
        fullName: u.fullName,
        phone: u.phone,
        customerType: u.customerType,
        orderCount: agg?.orderCount ?? 0,
        totalSpend: agg?.totalSpend ?? 0,
        lastOrderAt: agg?.lastOrderAt ?? null,
        segment,
      };
    });
  }

  async list(segment?: CustomerSegment, skip = 0, take = 50) {
    const all = await this.summarize();
    const filtered = segment ? all.filter((c) => c.segment === segment) : all;
    filtered.sort((a, b) => (b.lastOrderAt?.getTime() ?? 0) - (a.lastOrderAt?.getTime() ?? 0));
    return { items: filtered.slice(skip, skip + take), total: filtered.length };
  }

  async segmentCounts(): Promise<Record<CustomerSegment, number>> {
    const all = await this.summarize();
    const counts: Record<CustomerSegment, number> = { B2B: 0, NEW: 0, LOYAL: 0, ACTIVE: 0, LOW_ACTIVITY: 0, INACTIVE: 0, NO_ORDERS: 0 };
    for (const c of all) counts[c.segment]++;
    return counts;
  }

  async summaryFor(userId: string): Promise<CustomerSummary | null> {
    const [summary] = await this.summarize([userId]);
    return summary ?? null;
  }
}
