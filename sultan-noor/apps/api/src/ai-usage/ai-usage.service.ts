import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';

// Shared home for the SEO/Content Autopilot's budget pool — deliberately
// separate from AiImageAutopilotService's own checkBudget/recordUsage,
// which is scoped to its own image-* providers on the same AiUsageLog
// table. Two independent pools, one shared audit-friendly table.
const SEO_CONTENT_PROVIDERS = ['seo-generation', 'content-generation'] as const;
type SeoContentProvider = (typeof SEO_CONTENT_PROVIDERS)[number];

@Injectable()
export class AiUsageService {
  constructor(
    private prisma: PrismaService,
    private settings: SettingsService,
  ) {}

  async checkBudget(): Promise<boolean> {
    const budgetRaw = await this.settings.resolve('seoContentMonthlyBudgetToman');
    if (!budgetRaw) return true; // no budget configured yet = not opted into cost control
    const budget = Number(budgetRaw);
    if (!Number.isFinite(budget) || budget <= 0) return true;

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const usage = await this.prisma.aiUsageLog.aggregate({
      where: { createdAt: { gte: startOfMonth }, provider: { in: [...SEO_CONTENT_PROVIDERS] } },
      _sum: { costToman: true },
    });
    const spent = Number(usage._sum.costToman ?? 0);
    return spent < budget;
  }

  async record(provider: SeoContentProvider, refId: string | undefined, success: boolean, costToman: number): Promise<void> {
    await this.prisma.aiUsageLog.create({
      data: {
        provider,
        operation: provider,
        draftId: refId,
        costToman: success ? costToman : 0,
        success,
        note: 'برآورد تقریبی هزینه — نه رقم دقیق صورتحساب',
      },
    });
  }
}
