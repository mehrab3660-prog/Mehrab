import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { REAL_SALE_STATUSES } from '../common/constants/order-status';

const LOW_STOCK_THRESHOLD = 5;
const STALE_DAYS = 60; // no real sale in this many days = "stale inventory"
const HIGH_DEMAND_WINDOW_DAYS = 30;
const HIGH_DEMAND_MIN_QTY = 5; // at least this many units sold in the window to count as "high demand"

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

// Real sales-opportunity signals computed from Order/OrderItem/Stock rows —
// no AI, no guessing. This is the grounding data SalesRecommendationService
// hands to the AI for discount/campaign drafts, and the direct source for
// the rule-based CROSS_SELL/BUNDLE suggestions (which need no AI call at
// all — they're just real order co-occurrence, formatted).
@Injectable()
export class ProductOpportunitiesService {
  constructor(private prisma: PrismaService) {}

  // Total stock (summed across variants/warehouses) per published product.
  private async stockByProduct(): Promise<Map<string, number>> {
    const variants = await this.prisma.productVariant.findMany({
      where: { product: { status: 'PUBLISHED' } },
      select: { productId: true, stocks: { select: { quantity: true } } },
    });
    const map = new Map<string, number>();
    for (const v of variants) {
      const sum = v.stocks.reduce((s, st) => s + st.quantity, 0);
      map.set(v.productId, (map.get(v.productId) ?? 0) + sum);
    }
    return map;
  }

  private async quantitySoldByProduct(days: number): Promise<Map<string, number>> {
    const orders = await this.prisma.order.findMany({ where: { createdAt: { gte: daysAgo(days) }, status: { in: REAL_SALE_STATUSES } }, select: { id: true } });
    if (orders.length === 0) return new Map();
    const items = await this.prisma.orderItem.groupBy({ by: ['productId'], where: { orderId: { in: orders.map((o) => o.id) } }, _sum: { quantity: true } });
    return new Map(items.map((i) => [i.productId, i._sum.quantity ?? 0]));
  }

  // Best sellers whose remaining stock is running low — a real, time-
  // sensitive restock signal.
  async bestSellingLowStock(days = HIGH_DEMAND_WINDOW_DAYS) {
    const [stock, sold] = await Promise.all([this.stockByProduct(), this.quantitySoldByProduct(days)]);
    const candidateIds = [...sold.keys()].filter((id) => (stock.get(id) ?? 0) <= LOW_STOCK_THRESHOLD);
    if (candidateIds.length === 0) return [];

    const products = await this.prisma.product.findMany({ where: { id: { in: candidateIds } }, select: { id: true, name: true } });
    return products
      .map((p) => ({ productId: p.id, name: p.name, quantitySold: sold.get(p.id) ?? 0, stockRemaining: stock.get(p.id) ?? 0 }))
      .sort((a, b) => b.quantitySold - a.quantitySold);
  }

  // Same idea, phrased as "demand outpacing supply" — high recent sales
  // velocity relative to what's left.
  async highDemandLowStock(days = HIGH_DEMAND_WINDOW_DAYS) {
    const rows = await this.bestSellingLowStock(days);
    return rows.filter((r) => r.quantitySold >= HIGH_DEMAND_MIN_QTY);
  }

  // Published products holding real stock but with no real sale in
  // STALE_DAYS — money sitting on a shelf.
  async staleInventory(staleDays = STALE_DAYS) {
    const [stock, recentlySoldIds] = await Promise.all([
      this.stockByProduct(),
      this.prisma.orderItem
        .findMany({ where: { order: { createdAt: { gte: daysAgo(staleDays) }, status: { in: REAL_SALE_STATUSES } } }, select: { productId: true }, distinct: ['productId'] })
        .then((rows) => new Set(rows.map((r) => r.productId))),
    ]);

    const staleIds = [...stock.entries()].filter(([id, qty]) => qty > 0 && !recentlySoldIds.has(id)).map(([id]) => id);
    if (staleIds.length === 0) return [];

    const products = await this.prisma.product.findMany({ where: { id: { in: staleIds } }, select: { id: true, name: true, createdAt: true } });
    return products.map((p) => ({ productId: p.id, name: p.name, stockRemaining: stock.get(p.id) ?? 0, publishedAt: p.createdAt })).sort((a, b) => b.stockRemaining - a.stockRemaining);
  }

  // Real, system-wide co-purchase pairs — computed once from actual order
  // history, not per-product N+1 calls and not a category-similarity guess.
  // Only pairs bought together at least MIN_CO_OCCURRENCE times are real
  // enough to call a pattern.
  async crossSellPairs(days = 180, minCoOccurrence = 2, take = 15) {
    const orders = await this.prisma.order.findMany({ where: { createdAt: { gte: daysAgo(days) }, status: { in: REAL_SALE_STATUSES } }, select: { id: true } });
    if (orders.length === 0) return [];

    const items = await this.prisma.orderItem.findMany({
      where: { orderId: { in: orders.map((o) => o.id) } },
      select: { orderId: true, productId: true },
    });

    const productsByOrder = new Map<string, Set<string>>();
    for (const item of items) {
      const set = productsByOrder.get(item.orderId) ?? new Set<string>();
      set.add(item.productId);
      productsByOrder.set(item.orderId, set);
    }

    const pairCounts = new Map<string, number>();
    for (const productIds of productsByOrder.values()) {
      const ids = [...productIds].sort();
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const key = `${ids[i]}::${ids[j]}`;
          pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
        }
      }
    }

    const strongPairs = [...pairCounts.entries()]
      .filter(([, count]) => count >= minCoOccurrence)
      .sort((a, b) => b[1] - a[1])
      .slice(0, take);
    if (strongPairs.length === 0) return [];

    const allIds = new Set<string>();
    for (const [key] of strongPairs) {
      const [a, b] = key.split('::');
      allIds.add(a);
      allIds.add(b);
    }
    const products = await this.prisma.product.findMany({ where: { id: { in: [...allIds] }, status: 'PUBLISHED' }, select: { id: true, name: true } });
    const productById = new Map(products.map((p) => [p.id, p.name]));

    return strongPairs
      .map(([key, coOccurrence]) => {
        const [productAId, productBId] = key.split('::');
        return { productAId, productAName: productById.get(productAId), productBId, productBName: productById.get(productBId), coOccurrence };
      })
      .filter((p) => p.productAName && p.productBName); // drop pairs touching an unpublished/deleted product
  }
}
