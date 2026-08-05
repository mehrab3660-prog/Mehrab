import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async summary() {
    const [totalOrders, totalRevenue, totalUsers, totalProducts, lowStock, pendingReviews, ordersByStatus] = await Promise.all([
      this.prisma.order.count(),
      this.prisma.order.aggregate({ _sum: { grandTotal: true }, where: { status: { in: ['PROCESSING', 'SHIPPED', 'DELIVERED'] } } }),
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
      where: { createdAt: { gte: since }, status: { in: ['PROCESSING', 'SHIPPED', 'DELIVERED'] } },
      select: { createdAt: true, grandTotal: true },
    });

    const byDay = new Map<string, number>();
    for (const order of orders) {
      const key = order.createdAt.toISOString().slice(0, 10);
      byDay.set(key, (byDay.get(key) ?? 0) + Number(order.grandTotal));
    }
    return Array.from(byDay.entries()).map(([date, total]) => ({ date, total })).sort((a, b) => a.date.localeCompare(b.date));
  }
}
