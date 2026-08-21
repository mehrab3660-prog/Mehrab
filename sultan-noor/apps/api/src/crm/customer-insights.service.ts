import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { REAL_SALE_STATUSES } from '../common/constants/order-status';
import { CustomerSegmentationService } from './customer-segmentation.service';

// A real, deterministic statistical method (moving average of gaps between
// consecutive real orders) — not a fabricated ML model. Requires at least
// this many real orders before a next-purchase estimate is offered at all;
// below that, the gap between two dates isn't a real "pattern" yet.
const MIN_ORDERS_FOR_PREDICTION = 3;

@Injectable()
export class CustomerInsightsService {
  constructor(
    private prisma: PrismaService,
    private segmentation: CustomerSegmentationService,
  ) {}

  async insightsFor(userId: string) {
    const summary = await this.segmentation.summaryFor(userId);
    if (!summary) throw new NotFoundException('مشتری یافت نشد');

    const orders = await this.prisma.order.findMany({
      where: { userId, status: { in: REAL_SALE_STATUSES } },
      select: { id: true, createdAt: true, grandTotal: true },
      orderBy: { createdAt: 'asc' },
    });

    const orderIds = orders.map((o) => o.id);
    const items = orderIds.length
      ? await this.prisma.orderItem.findMany({
          where: { orderId: { in: orderIds } },
          select: { productId: true, nameSnapshot: true, quantity: true, product: { select: { category: { select: { id: true, name: true } } } } },
        })
      : [];

    const productCounts = new Map<string, { name: string; quantity: number }>();
    const categoryCounts = new Map<string, { name: string; quantity: number }>();
    for (const item of items) {
      const p = productCounts.get(item.productId) ?? { name: item.nameSnapshot, quantity: 0 };
      p.quantity += item.quantity;
      productCounts.set(item.productId, p);

      const category = item.product?.category;
      if (category) {
        const c = categoryCounts.get(category.id) ?? { name: category.name, quantity: 0 };
        c.quantity += item.quantity;
        categoryCounts.set(category.id, c);
      }
    }

    const frequentProducts = Array.from(productCounts.entries())
      .map(([productId, v]) => ({ productId, name: v.name, quantity: v.quantity }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 10);
    const frequentCategories = Array.from(categoryCounts.entries())
      .map(([categoryId, v]) => ({ categoryId, name: v.name, quantity: v.quantity }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 10);

    // Real average gap between consecutive real orders — null when there
    // aren't at least two real orders to measure a gap from.
    let avgDaysBetweenOrders: number | null = null;
    if (orders.length >= 2) {
      const gaps: number[] = [];
      for (let i = 1; i < orders.length; i++) {
        gaps.push((orders[i].createdAt.getTime() - orders[i - 1].createdAt.getTime()) / (24 * 60 * 60 * 1000));
      }
      avgDaysBetweenOrders = Math.round((gaps.reduce((s, g) => s + g, 0) / gaps.length) * 10) / 10;
    }

    const predictionAvailable = orders.length >= MIN_ORDERS_FOR_PREDICTION && avgDaysBetweenOrders !== null;
    const nextPurchaseEstimate = predictionAvailable
      ? new Date(summary.lastOrderAt!.getTime() + avgDaysBetweenOrders! * 24 * 60 * 60 * 1000)
      : null;

    return {
      ...summary,
      frequentProducts,
      frequentCategories,
      avgDaysBetweenOrders,
      nextPurchaseEstimate,
      predictionAvailable,
      predictionNote: predictionAvailable
        ? null
        : `داده کافی برای برآورد آماری معتبر وجود ندارد (حداقل ${MIN_ORDERS_FOR_PREDICTION} خرید واقعی لازم است).`,
    };
  }
}
