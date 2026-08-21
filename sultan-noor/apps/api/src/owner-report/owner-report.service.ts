import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SalesAnalyticsService } from '../sales-autopilot/sales-analytics.service';
import { AbandonedCartInsightService } from '../sales-autopilot/abandoned-cart-insight.service';
import { InventoryForecastService } from '../inventory/inventory-forecast.service';

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// Sprint 8 §7 "گزارش هوشمند امروز سلطان نور" — every field is a real,
// backend-computed number reused from the exact same services that already
// power Sales Autopilot / Inventory Forecast / Abandoned Cart Insight
// (nothing here re-implements those calculations). importantIssues is built
// only from real counts that are actually > 0 — a quiet day produces a
// short list, never a fabricated warning.
@Injectable()
export class OwnerReportService {
  constructor(
    private prisma: PrismaService,
    private salesAnalytics: SalesAnalyticsService,
    private abandonedCart: AbandonedCartInsightService,
    private inventoryForecast: InventoryForecastService,
  ) {}

  async dailyReport() {
    const [salesOverview, abandonedCartSummary, forecast, pendingApprovals, aiActivityToday, unansweredQuestions] = await Promise.all([
      this.salesAnalytics.overview(30),
      this.abandonedCart.summary(),
      this.inventoryForecast.forecast(),
      this.pendingApprovalsCount(),
      this.aiActivityToday(),
      this.prisma.question.count({ where: { answers: { none: {} } } }),
    ]);

    const criticalStock = forecast.forecasts.filter((f) => f.riskLevel === 'CRITICAL');
    const lowStock = forecast.forecasts.filter((f) => f.riskLevel === 'LOW');
    const reviewStock = forecast.forecasts.filter((f) => f.riskLevel === 'REVIEW');

    const importantIssues: string[] = [];
    if (criticalStock.length > 0) importantIssues.push(`${criticalStock.length} محصول در وضعیت بحرانی موجودی هستند (کمتر از ۳ روز تا اتمام).`);
    if (abandonedCartSummary.count > 0) importantIssues.push(`${abandonedCartSummary.count} سبد خرید واقعی رهاشده در ۷ روز گذشته ثبت شده است.`);
    if (unansweredQuestions > 0) importantIssues.push(`${unansweredQuestions} پرسش مشتری هنوز بدون پاسخ است.`);
    if (aiActivityToday.errorCount > 0) importantIssues.push(`${aiActivityToday.errorCount} خطای هوش مصنوعی امروز ثبت شده است.`);
    if (pendingApprovals.total > 0) importantIssues.push(`${pendingApprovals.total} مورد در انتظار تأیید مالک است.`);

    return {
      date: startOfToday().toISOString().slice(0, 10),
      sales: {
        today: salesOverview.today,
        bestSellers: salesOverview.bestSellersByRevenue.slice(0, 5),
        worstSellers: salesOverview.worstSellers.slice(0, 5),
      },
      inventory: {
        criticalCount: criticalStock.length,
        lowCount: lowStock.length,
        reviewCount: reviewStock.length,
        criticalProducts: criticalStock.slice(0, 5),
        insufficientDataCount: forecast.insufficientData.length,
      },
      abandonedCarts: { count: abandonedCartSummary.count, approximateValueToman: abandonedCartSummary.approximateValueToman },
      pendingApprovals,
      aiActivityToday,
      unansweredQuestions,
      importantIssues,
      salesDataGaps: salesOverview.dataGaps,
    };
  }

  // Sprint 8 §9 — only ever a real comparison of two real, equal-length,
  // already-elapsed 7-day windows (reused from SalesAnalyticsService); when
  // last week has no real orders to compare against, comparisonAvailable is
  // false and no percentage is fabricated.
  async weeklyReport() {
    const weekOverWeek = await this.salesAnalytics.weekOverWeek();
    return {
      ...weekOverWeek,
      note: weekOverWeek.comparisonAvailable ? null : 'داده کافی از هفته گذشته برای مقایسه واقعی وجود ندارد.',
    };
  }

  private async pendingApprovalsCount() {
    const [productDrafts, seoSuggestions, contentDrafts, salesRecommendations, newsPendingReview, reorderRecommendations] = await Promise.all([
      this.prisma.productAiDraft.count({ where: { status: 'PENDING_REVIEW' } }),
      this.prisma.productSeoSuggestion.count({ where: { status: 'PENDING_REVIEW' } }),
      this.prisma.contentDraft.count({ where: { status: 'PENDING_REVIEW' } }),
      this.prisma.salesRecommendation.count({ where: { status: 'PENDING_REVIEW' } }),
      this.prisma.newsItem.count({ where: { status: 'PENDING_REVIEW' } }),
      this.prisma.reorderRecommendation.count({ where: { status: 'PENDING_REVIEW' } }),
    ]);
    const total = productDrafts + seoSuggestions + contentDrafts + salesRecommendations + newsPendingReview + reorderRecommendations;
    return { productDrafts, seoSuggestions, contentDrafts, salesRecommendations, newsPendingReview, reorderRecommendations, total };
  }

  // Real AI Usage Log aggregate for today (Sprint 8 §12/§13) — the same
  // shared table every AI feature already writes to, just windowed to
  // today. Never a guess: zero real AiUsageLog rows today means all zeros.
  private async aiActivityToday() {
    const [totalCalls, errorCount, costAgg] = await Promise.all([
      this.prisma.aiUsageLog.count({ where: { createdAt: { gte: startOfToday() } } }),
      this.prisma.aiUsageLog.count({ where: { createdAt: { gte: startOfToday() }, success: false } }),
      this.prisma.aiUsageLog.aggregate({ where: { createdAt: { gte: startOfToday() } }, _sum: { costToman: true } }),
    ]);
    return { totalCalls, successCount: totalCalls - errorCount, errorCount, costTomanToday: Number(costAgg._sum.costToman ?? 0) };
  }
}
