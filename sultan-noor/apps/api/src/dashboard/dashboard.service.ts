import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SeoAuditService } from '../seo-autopilot/seo-audit.service';
import { SalesAnalyticsService } from '../sales-autopilot/sales-analytics.service';
import { ProductOpportunitiesService } from '../sales-autopilot/product-opportunities.service';
import { AbandonedCartInsightService } from '../sales-autopilot/abandoned-cart-insight.service';
import { REAL_SALE_STATUSES } from '../common/constants/order-status';

@Injectable()
export class DashboardService {
  constructor(
    private prisma: PrismaService,
    private seoAudit: SeoAuditService,
    private salesAnalytics: SalesAnalyticsService,
    private opportunities: ProductOpportunitiesService,
    private abandonedCart: AbandonedCartInsightService,
  ) {}

  async summary() {
    const [totalOrders, totalRevenue, totalUsers, totalProducts, lowStock, pendingReviews, ordersByStatus] = await Promise.all([
      this.prisma.order.count(),
      this.prisma.order.aggregate({ _sum: { grandTotal: true }, where: { status: { in: REAL_SALE_STATUSES } } }),
      this.prisma.user.count(),
      this.prisma.product.count(),
      this.prisma.stock.count({ where: { quantity: { lte: 5 } } }),
      this.prisma.review.count({ where: { isApproved: false } }),
      this.prisma.order.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);

    return {
      totalOrders,
      totalRevenue: totalRevenue._sum.grandTotal ?? 0,
      totalUsers,
      totalProducts,
      lowStockVariants: lowStock,
      pendingReviews,
      ordersByStatus: ordersByStatus.map((o) => ({ status: o.status, count: o._count._all })),
    };
  }

  async salesByDay(days = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);
    const orders = await this.prisma.order.findMany({
      where: { createdAt: { gte: since }, status: { in: REAL_SALE_STATUSES } },
      select: { createdAt: true, grandTotal: true },
    });

    const byDay = new Map<string, number>();
    for (const order of orders) {
      const key = order.createdAt.toISOString().slice(0, 10);
      byDay.set(key, (byDay.get(key) ?? 0) + Number(order.grandTotal));
    }
    return Array.from(byDay.entries()).map(([date, total])=>({date, total})).sort((a, b) => a.date.localeCompare(b.date));
  }

  // A single, date-range-scoped sales report: revenue/AOV/customer-count
  // summary, daily revenue trend, top products by revenue, revenue split by
  // category, customer-segment (retail vs wholesale) breakdown, and the
  // full order-status funnel for the range — everything computed from real
  // Order/OrderItem rows, never estimated or fabricated.
  async report(fromStr?: string, toStr?: string) {
    const to = toStr ? new Date(toStr) : new Date();
    to.setHours(23, 59, 59, 999);
    const from = fromStr ? new Date(fromStr) : new Date(to);
    if (!fromStr) from.setDate(from.getDate() - 29);
    from.setHours(0, 0, 0, 0);

    const [realOrders, statusCounts] = await Promise.all([
      this.prisma.order.findMany({
        where: { createdAt: { gte: from, lte: to }, status: { in: REAL_SALE_STATUSES } },
        select: { id: true, createdAt: true, grandTotal: true, userId: true, user: { select: { customerType: true } } },
      }),
      this.prisma.order.groupBy({
        by: ['status'],
        where: { createdAt: { gte: from, lte: to } },
        _count: { _all: true },
      }),
    ]);

    const totalRevenue = realOrders.reduce((sum, o) => sum + Number(o.grandTotal), 0);
    const totalOrders = realOrders.length;
    const uniqueCustomers = new Set(realOrders.map((o) => o.userId)).size;

    const revenueByDayMap = new Map<string, number>();
    const segmentMap = new Map<string, { orders: number; revenue: number }>();
    for (const order of realOrders) {
      const dayKey = order.createdAt.toISOString().slice(0, 10);
      revenueByDayMap.set(dayKey, (revenueByDayMap.get(dayKey) ?? 0) + Number(order.grandTotal));

      const segment = order.user?.customerType ?? 'RETAIL';
      const current = segmentMap.get(segment) ?? { orders: 0, revenue: 0 };
      current.orders += 1;
      current.revenue += Number(order.grandTotal);
      segmentMap.set(segment, current);
    }

    const orderIds = realOrders.map((o) => o.id);
    const items = orderIds.length
      ? await this.prisma.orderItem.findMany({
          where: { orderId: { in: orderIds } },
          select: {
            productId: true,
            nameSnapshot: true,
            quantity: true,
            lineTotal: true,
            product: { select: { category: { select: { name: true } } } },
          },
        })
      : [];

    const productMap = new Map<string, { name: string; quantitySold: number; revenue: number }>();
    const categoryMap = new Map<string, number>();
    for (const item of items) {
      const product = productMap.get(item.productId) ?? { name: item.nameSnapshot, quantitySold: 0, revenue: 0 };
      product.quantitySold += item.quantity;
      product.revenue += Number(item.lineTotal);
      productMap.set(item.productId, product);

      const categoryName = item.product?.category?.name ?? 'دسته‌بندی‌نشده';
      categoryMap.set(categoryName, (categoryMap.get(categoryName) ?? 0) + Number(item.lineTotal));
    }

    return {
      range: { from: from.toISOString(), to: to.toISOString() },
      summary: {
        totalRevenue,
        totalOrders,
        averageOrderValue: totalOrders ? totalRevenue / totalOrders : 0,
        uniqueCustomers,
      },
      revenueByDay: Array.from(revenueByDayMap.entries())
        .map(([date, total]) => ({ date, total }))
        .sort((a, b) => a.date.localeCompare(b.date)),
      topProducts: Array.from(productMap.entries())
        .map(([productId, v]) => ({ productId, ...v }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10),
      revenueByCategory: Array.from(categoryMap.entries())
        .map(([categoryName, revenue]) => ({ categoryName, revenue }))
        .sort((a, b) => b.revenue - a.revenue),
      customerSegments: Array.from(segmentMap.entries()).map(([customerType, v]) => ({ customerType, ...v })),
      ordersByStatus: statusCounts.map((s) => ({ status: s.status, count: s._count._all })),
    };
  }

  // A single, read-only view over signals that already exist elsewhere in
  // the app (AI drafts, unanswered questions, low stock, the audit log,
  // SEO problems, pending SEO/content review) — never fabricates a "sales
  // opportunity" or any other widget with no real data source behind it.
  // Nothing here is itself an AI action; it only surfaces what a human
  // still needs to look at.
  async aiControlCenter() {
    const [
      pendingDraftsCount,
      pendingDrafts,
      draftsNeedingAttention,
      unansweredQuestions,
      lowStock,
      recentAiActivity,
      seoProblems,
      pendingSeoSuggestionsRaw,
      pendingContentDrafts,
      productsNeedingSeoCount,
      aiUsageThisMonth,
      salesOverview,
      criticalStockOpportunities,
      crossSellPairs,
      abandonedCartSummary,
      pendingSalesRecommendations,
    ] = await Promise.all([
      this.prisma.productAiDraft.count({ where: { status: 'PENDING_REVIEW' } }),
      this.prisma.productAiDraft.findMany({
        where: { status: 'PENDING_REVIEW' },
        select: { id: true, name: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      this.prisma.productAiDraft.findMany({
        where: { status: 'PENDING_REVIEW', imageAutopilotNote: { not: null } },
        select: { id: true, name: true, imageAutopilotNote: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      this.prisma.question.findMany({
        where: { answers: { none: {} } },
        select: { id: true, body: true, createdAt: true, product: { select: { id: true, name: true, slug: true } } },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      this.prisma.stock.findMany({
        where: { quantity: { lte: 5 } },
        select: { quantity: true, productVariant: { select: { sku: true, product: { select: { id: true, name: true } } } } },
        orderBy: { quantity: 'asc' },
        take: 10,
      }),
      this.prisma.auditLog.findMany({
        where: { OR: [{ action: { startsWith: 'ai_' } }, { action: { startsWith: 'seo.' } }, { action: { startsWith: 'content.' } }] },
        select: { action: true, entityType: true, entityId: true, createdAt: true, user: { select: { fullName: true, phone: true } } },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.seoAudit.run(),
      this.prisma.productSeoSuggestion.findMany({
        where: { status: 'PENDING_REVIEW' },
        select: { id: true, productId: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      this.prisma.contentDraft.findMany({
        where: { status: 'PENDING_REVIEW' },
        select: { id: true, type: true, topic: true, title: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      this.prisma.product.count({ where: { status: 'PUBLISHED', OR: [{ metaTitle: null }, { metaDescription: null }] } }),
      this.monthlyAiUsageCost(),
      this.salesAnalytics.overview(30),
      this.opportunities.bestSellingLowStock(),
      this.opportunities.crossSellPairs(),
      this.abandonedCart.summary(),
      this.prisma.salesRecommendation.findMany({
        where: { status: 'PENDING_REVIEW' },
        select: { id: true, type: true, title: true, severity: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);

    const suggestionProductIds = pendingSeoSuggestionsRaw.map((s) => s.productId);
    const suggestionProducts = suggestionProductIds.length
      ? await this.prisma.product.findMany({ where: { id: { in: suggestionProductIds } }, select: { id: true, name: true } })
      : [];
    const productNameById = new Map(suggestionProducts.map((p) => [p.id, p.name]));
    const pendingSeoSuggestions = pendingSeoSuggestionsRaw.map((s) => ({ ...s, productName: productNameById.get(s.productId) ?? 'محصول حذف‌شده' }));

    const seoProblemsBySeverity = { HIGH: 0, MEDIUM: 0, LOW: 0 };
    for (const p of seoProblems) seoProblemsBySeverity[p.severity]++;

    return {
      pendingDraftsCount,
      pendingDrafts,
      draftsNeedingAttention,
      unansweredQuestions,
      lowStockVariants: lowStock.map((s) => ({
        quantity: s.quantity,
        sku: s.productVariant.sku,
        productId: s.productVariant.product.id,
        productName: s.productVariant.product.name,
      })),
      recentAiActivity,
      seoProblemsCount: seoProblems.length,
      seoProblemsBySeverity,
      seoProblemsSample: seoProblems.slice(0, 10),
      pendingSeoSuggestions,
      pendingContentDrafts,
      productsNeedingSeoCount,
      aiUsageCostThisMonthToman: aiUsageThisMonth,
      salesToday: salesOverview.today,
      salesThisMonth: salesOverview.thisMonth,
      bestSellers: salesOverview.bestSellersByRevenue.slice(0, 5),
      worstSellers: salesOverview.worstSellers.slice(0, 5),
      decliningSalesProducts: salesOverview.decliningSalesProducts.slice(0, 5),
      criticalStockOpportunities: criticalStockOpportunities.slice(0, 5),
      crossSellOpportunityCount: crossSellPairs.length,
      bundleOpportunityCount: crossSellPairs.filter((p) => p.coOccurrence >= 3).length,
      abandonedCarts: { count: abandonedCartSummary.count, approximateValueToman: abandonedCartSummary.approximateValueToman },
      pendingSalesRecommendations,
      salesDataGaps: salesOverview.dataGaps,
    };
  }

  private async monthlyAiUsageCost(): Promise<number> {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const usage = await this.prisma.aiUsageLog.aggregate({ where: { createdAt: { gte: startOfMonth } }, _sum: { costToman: true } });
    return Number(usage._sum.costToman ?? 0);
  }
}
