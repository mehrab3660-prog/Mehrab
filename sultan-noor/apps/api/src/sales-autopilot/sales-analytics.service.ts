import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { REAL_SALE_STATUSES } from '../common/constants/order-status';

const DEFAULT_WINDOW_DAYS = 30;
const DECLINE_THRESHOLD = 0.3; // flag a product once quantity sold drops 30%+ period-over-period
const DECLINE_MIN_PRIOR_QTY = 3; // ignore noise from products that barely sold anything before either

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Pure, rule-based reads over real Order/OrderItem/Product/Stock rows — no
// AI involved, so this stays available even if the AI provider is down and
// nothing here is ever estimated or guessed. Any KPI this store genuinely
// has no data for (page views, search queries — nothing in this codebase
// actually records those events yet) is reported through `dataGaps` instead
// of being silently invented or omitted without explanation.
@Injectable()
export class SalesAnalyticsService {
  constructor(private prisma: PrismaService) {}

  async overview(days = DEFAULT_WINDOW_DAYS) {
    const [today, thisMonth, window, bestSellers, worstSellers, noSales, declining, revenueByDay] = await Promise.all([
      this.revenueForRange(startOfToday(), new Date()),
      this.revenueForRange(startOfMonth(), new Date()),
      this.revenueForRange(daysAgo(days), new Date()),
      this.bestSellers(days, 10),
      this.worstSellers(days, 10),
      this.noSalesProducts(10),
      this.decliningSalesProducts(days),
      this.revenueTrend(days, 'day'),
    ]);

    return {
      today,
      thisMonth,
      window: { days, ...window },
      bestSellersByRevenue: [...bestSellers].sort((a, b) => b.revenue - a.revenue),
      bestSellersByQuantity: [...bestSellers].sort((a, b) => b.quantitySold - a.quantitySold),
      worstSellers,
      noSalesProducts: noSales,
      decliningSalesProducts: declining,
      revenueByDay,
      dataGaps: [
        'نرخ تبدیل (Conversion Rate): داده بازدید واقعی سایت هنوز ثبت نمی‌شود، بنابراین این عدد قابل محاسبه واقعی نیست.',
        'محصولات با بازدید بالا و فروش پایین: داده بازدید محصول هنوز به‌صورت واقعی جمع‌آوری نمی‌شود.',
        'جستجوهای پرتکرار: لاگ جستجوی واقعی هنوز ذخیره نمی‌شود.',
      ],
    };
  }

  // Real week-over-week comparison (Sprint 8 §9) — reuses the exact same
  // real-order-status revenueForRange this service already uses everywhere
  // else. Only ever compares two real, equal-length, already-elapsed
  // windows; never invents a trend when there's nothing to compare against.
  async weekOverWeek() {
    const now = new Date();
    const [thisWeek, lastWeek] = await Promise.all([this.revenueForRange(daysAgo(7), now), this.revenueForRange(daysAgo(14), daysAgo(7))]);

    const revenueChangePercent = lastWeek.revenue > 0 ? Math.round(((thisWeek.revenue - lastWeek.revenue) / lastWeek.revenue) * 1000) / 10 : null;
    const orderCountChangePercent = lastWeek.orderCount > 0 ? Math.round(((thisWeek.orderCount - lastWeek.orderCount) / lastWeek.orderCount) * 1000) / 10 : null;

    return {
      thisWeek,
      lastWeek,
      revenueChangePercent,
      orderCountChangePercent,
      comparisonAvailable: lastWeek.orderCount > 0,
    };
  }

  private async revenueForRange(from: Date, to: Date) {
    const orders = await this.prisma.order.findMany({
      where: { createdAt: { gte: from, lte: to }, status: { in: REAL_SALE_STATUSES } },
      select: { grandTotal: true },
    });
    const revenue = orders.reduce((sum, o) => sum + Number(o.grandTotal), 0);
    return {
      revenue,
      orderCount: orders.length,
      averageOrderValue: orders.length ? revenue / orders.length : 0,
    };
  }

  async revenueTrend(days: number, granularity: 'day' | 'week' | 'month' = 'day') {
    const orders = await this.prisma.order.findMany({
      where: { createdAt: { gte: daysAgo(days) }, status: { in: REAL_SALE_STATUSES } },
      select: { createdAt: true, grandTotal: true },
    });

    const bucketed = new Map<string, number>();
    for (const order of orders) {
      const key = bucketKey(order.createdAt, granularity);
      bucketed.set(key, (bucketed.get(key) ?? 0) + Number(order.grandTotal));
    }
    return Array.from(bucketed.entries())
      .map(([period, total]) => ({ period, total }))
      .sort((a, b) => a.period.localeCompare(b.period));
  }

  // Products actually sold in the window, ranked — used for both "پرفروش‌ترین"
  // (by quantity/revenue) and as the base list "worst" filters down from.
  private async soldProducts(days: number) {
    const orders = await this.prisma.order.findMany({
      where: { createdAt: { gte: daysAgo(days) }, status: { in: REAL_SALE_STATUSES } },
      select: { id: true },
    });
    if (orders.length === 0) return [];

    const grouped = await this.prisma.orderItem.groupBy({
      by: ['productId'],
      where: { orderId: { in: orders.map((o) => o.id) } },
      _sum: { quantity: true, lineTotal: true },
    });
    if (grouped.length === 0) return [];

    const products = await this.prisma.product.findMany({
      where: { id: { in: grouped.map((g) => g.productId) } },
      select: { id: true, name: true, status: true },
    });
    const productById = new Map(products.map((p) => [p.id, p]));

    return grouped
      .map((g) => ({
        productId: g.productId,
        name: productById.get(g.productId)?.name ?? 'محصول حذف‌شده',
        status: productById.get(g.productId)?.status ?? null,
        quantitySold: g._sum.quantity ?? 0,
        revenue: Number(g._sum.lineTotal ?? 0),
      }))
      .filter((p) => p.status !== null); // drop rows for since-deleted products — nothing real to show
  }

  async bestSellers(days = DEFAULT_WINDOW_DAYS, take = 10) {
    const sold = await this.soldProducts(days);
    return sold.sort((a, b) => b.revenue - a.revenue).slice(0, take);
  }

  async worstSellers(days = DEFAULT_WINDOW_DAYS, take = 10) {
    const sold = await this.soldProducts(days);
    return sold
      .filter((p) => p.status === 'PUBLISHED')
      .sort((a, b) => a.quantitySold - b.quantitySold)
      .slice(0, take);
  }

  // Published products with zero real sales ever — a genuinely different
  // signal from "worst sellers" (which at least sold something).
  async noSalesProducts(take = 20) {
    const soldProductIds = await this.prisma.orderItem.findMany({
      where: { order: { status: { in: REAL_SALE_STATUSES } } },
      select: { productId: true },
      distinct: ['productId'],
    });
    const products = await this.prisma.product.findMany({
      where: { status: 'PUBLISHED', id: { notIn: soldProductIds.map((s) => s.productId) } },
      select: { id: true, name: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
      take,
    });
    return products.map((p) => ({ productId: p.id, name: p.name, publishedAt: p.createdAt }));
  }

  // Compares this window's quantity sold against the equal-length prior
  // window — flags a real, computed decline, never a guess.
  async decliningSalesProducts(days = DEFAULT_WINDOW_DAYS) {
    const [current, prior] = await Promise.all([this.quantityByProduct(daysAgo(days), new Date()), this.quantityByProduct(daysAgo(days * 2), daysAgo(days))]);

    const result: { productId: string; name: string; currentQty: number; priorQty: number; declinePercent: number }[] = [];
    for (const [productId, prior_] of prior.entries()) {
      if (prior_.qty < DECLINE_MIN_PRIOR_QTY) continue;
      const currentQty = current.get(productId)?.qty ?? 0;
      const declinePercent = (prior_.qty - currentQty) / prior_.qty;
      if (declinePercent >= DECLINE_THRESHOLD) {
        result.push({ productId, name: prior_.name, currentQty, priorQty: prior_.qty, declinePercent: Math.round(declinePercent * 100) / 100 });
      }
    }
    return result.sort((a, b) => b.declinePercent - a.declinePercent);
  }

  private async quantityByProduct(from: Date, to: Date): Promise<Map<string, { qty: number; name: string }>> {
    const orders = await this.prisma.order.findMany({ where: { createdAt: { gte: from, lt: to }, status: { in: REAL_SALE_STATUSES } }, select: { id: true } });
    if (orders.length === 0) return new Map();
    const items = await this.prisma.orderItem.findMany({
      where: { orderId: { in: orders.map((o) => o.id) } },
      select: { productId: true, quantity: true, nameSnapshot: true },
    });
    const map = new Map<string, { qty: number; name: string }>();
    for (const item of items) {
      const entry = map.get(item.productId) ?? { qty: 0, name: item.nameSnapshot };
      entry.qty += item.quantity;
      map.set(item.productId, entry);
    }
    return map;
  }
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfMonth(): Date {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function bucketKey(date: Date, granularity: 'day' | 'week' | 'month'): string {
  if (granularity === 'month') return date.toISOString().slice(0, 7);
  if (granularity === 'week') {
    const d = new Date(date);
    const day = (d.getUTCDay() + 6) % 7; // Monday-anchored week
    d.setUTCDate(d.getUTCDate() - day);
    return d.toISOString().slice(0, 10);
  }
  return date.toISOString().slice(0, 10);
}
