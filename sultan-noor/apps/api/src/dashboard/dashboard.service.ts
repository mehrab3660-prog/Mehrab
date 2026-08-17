import { Injectable } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// Orders that actually represent real, counted sales — excludes carts that
// never paid (PENDING_PAYMENT) and orders that didn't ultimately happen
// (CANCELLED/REFUNDED). Every revenue figure in this service is scoped to
// these statuses so nothing fabricated or reversed inflates the numbers.
const REAL_SALE_STATUSES: OrderStatus[] = ['PROCESSING', 'SHIPPED', 'DELIVERED'];

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

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
}
