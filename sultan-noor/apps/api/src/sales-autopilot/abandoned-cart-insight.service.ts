import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Mirrors CartRecoveryService's own definition of "abandoned" (an untouched
// cart with real items, old enough to be idle but not so old it's ancient
// history) so this insight view and the actual SMS-reminder cron agree on
// what counts — one definition, reused, not reinvented.
const ABANDONED_AFTER_MS = 3 * 60 * 60 * 1000; // 3 hours
const IGNORE_OLDER_THAN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

@Injectable()
export class AbandonedCartInsightService {
  constructor(private prisma: PrismaService) {}

  async summary() {
    const now = Date.now();
    const carts = await this.prisma.cart.findMany({
      where: {
        updatedAt: { lte: new Date(now - ABANDONED_AFTER_MS), gte: new Date(now - IGNORE_OLDER_THAN_MS) },
        items: { some: {} },
      },
      include: {
        items: { include: { product: { select: { id: true, name: true } }, productVariant: { select: { price: true } } } },
      },
      orderBy: { updatedAt: 'asc' },
    });

    let approximateValue = 0;
    const productFrequency = new Map<string, { name: string; count: number }>();
    for (const cart of carts) {
      for (const item of cart.items) {
        const unitPrice = item.productVariant ? Number(item.productVariant.price) : 0;
        approximateValue += unitPrice * item.quantity;
        const entry = productFrequency.get(item.productId) ?? { name: item.product.name, count: 0 };
        entry.count += item.quantity;
        productFrequency.set(item.productId, entry);
      }
    }

    const frequentProducts = [...productFrequency.entries()]
      .map(([productId, v]) => ({ productId, ...v }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      count: carts.length,
      approximateValueToman: approximateValue,
      frequentProducts,
      oldestAbandonedAt: carts[0]?.updatedAt ?? null,
      carts: carts.slice(0, 20).map((c) => ({
        id: c.id,
        abandonedAt: c.updatedAt,
        itemCount: c.items.length,
        reminderAlreadySent: !!c.abandonedReminderSentAt,
      })),
    };
  }
}
