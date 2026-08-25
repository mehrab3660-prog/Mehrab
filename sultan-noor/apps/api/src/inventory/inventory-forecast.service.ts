import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { REAL_SALE_STATUSES } from '../common/constants/order-status';

const DEFAULT_WINDOW_DAYS = 30;
const DEFAULT_REORDER_TARGET_DAYS = 14;

export type InventoryRiskLevel = 'NORMAL' | 'REVIEW' | 'LOW' | 'CRITICAL';

export interface ProductForecast {
  productId: string;
  productName: string;
  currentStock: number;
  avgDailySales: number;
  daysRemaining: number;
  riskLevel: InventoryRiskLevel;
  suggestedReorderQuantity: number;
}

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

export function classifyRisk(daysRemaining: number): InventoryRiskLevel {
  if (daysRemaining <= 3) return 'CRITICAL';
  if (daysRemaining <= 7) return 'LOW';
  if (daysRemaining <= 14) return 'REVIEW';
  return 'NORMAL';
}

// Real, deterministic sell-through forecasting from actual Order/OrderItem/
// Stock rows — same rule-based pattern as SalesAnalyticsService /
// ProductOpportunitiesService (Sprint 5), no AI involved. A product with no
// real sale in the window gets no forecast at all — "داده کافی برای
// پیش‌بینی موجود نیست" — never a guessed sell-through rate.
@Injectable()
export class InventoryForecastService {
  constructor(private prisma: PrismaService) {}

  // Available stock (quantity minus reserved) summed across every
  // variant/warehouse for each published product — the same "available,
  // not just on-shelf" convention ProductsService.withStock already uses,
  // so موجودی رزروشده is honestly netted out rather than ignored.
  private async availableStockByProduct(): Promise<Map<string, number>> {
    const variants = await this.prisma.productVariant.findMany({
      where: { product: { status: 'PUBLISHED' } },
      select: { productId: true, stocks: { select: { quantity: true, reservedQuantity: true } } },
    });
    const map = new Map<string, number>();
    for (const v of variants) {
      const available = v.stocks.reduce((sum, s) => sum + Math.max(0, s.quantity - s.reservedQuantity), 0);
      map.set(v.productId, (map.get(v.productId) ?? 0) + available);
    }
    return map;
  }

  private async quantitySoldByProduct(days: number): Promise<Map<string, number>> {
    const orders = await this.prisma.order.findMany({ where: { createdAt: { gte: daysAgo(days) }, status: { in: REAL_SALE_STATUSES } }, select: { id: true } });
    if (orders.length === 0) return new Map();
    const items = await this.prisma.orderItem.groupBy({ by: ['productId'], where: { orderId: { in: orders.map((o) => o.id) } }, _sum: { quantity: true } });
    return new Map(items.map((i) => [i.productId, i._sum.quantity ?? 0]));
  }

  // §1: per-product forecast for every published product with real sales
  // history in the window; every product with real stock but zero real
  // sales is reported separately as insufficient-data, never forecast.
  async forecast(days = DEFAULT_WINDOW_DAYS, reorderTargetDays = DEFAULT_REORDER_TARGET_DAYS) {
    const [stock, sold, products] = await Promise.all([
      this.availableStockByProduct(),
      this.quantitySoldByProduct(days),
      this.prisma.product.findMany({ where: { status: 'PUBLISHED' }, select: { id: true, name: true } }),
    ]);

    const forecasts: ProductForecast[] = [];
    const insufficientData: { productId: string; productName: string }[] = [];

    for (const p of products) {
      const currentStock = stock.get(p.id) ?? 0;
      const quantitySold = sold.get(p.id) ?? 0;

      if (quantitySold <= 0) {
        insufficientData.push({ productId: p.id, productName: p.name });
        continue;
      }

      const avgDailySales = quantitySold / days;
      // Real stock already at (or past) zero while real sales exist — an
      // honest zero, not an infinite runway.
      const daysRemaining = currentStock <= 0 ? 0 : currentStock / avgDailySales;
      const riskLevel = classifyRisk(daysRemaining);
      const targetStock = avgDailySales * reorderTargetDays;
      const suggestedReorderQuantity = Math.max(0, Math.ceil(targetStock - currentStock));

      forecasts.push({
        productId: p.id,
        productName: p.name,
        currentStock,
        avgDailySales: Math.round(avgDailySales * 100) / 100,
        daysRemaining: Math.round(daysRemaining * 10) / 10,
        riskLevel,
        suggestedReorderQuantity,
      });
    }

    forecasts.sort((a, b) => a.daysRemaining - b.daysRemaining);
    return { forecasts, insufficientData, windowDays: days };
  }
}
