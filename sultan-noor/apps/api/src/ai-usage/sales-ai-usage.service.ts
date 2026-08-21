import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';

// Sales Autopilot's own budget pool — same shared AiUsageLog table as
// Image/SEO/Content Autopilot, but scoped to its own provider key and its
// own budget setting so none of the four pools can count against another.
// Only DISCOUNT/CAMPAIGN generation calls this; CROSS_SELL/BUNDLE
// suggestions are rule-based and never touch the AI provider at all.
const PROVIDER = 'sales-recommendation';

@Injectable()
export class SalesAiUsageService {
  constructor(
    private prisma: PrismaService,
    private settings: SettingsService,
  ) {}

  async checkBudget(): Promise<boolean> {
    const budgetRaw = await this.settings.resolve('salesAiMonthlyBudgetToman');
    if (!budgetRaw) return true; // no budget configured yet = not opted into cost control
    const budget = Number(budgetRaw);
    if (!Number.isFinite(budget) || budget <= 0) return true;

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const usage = await this.prisma.aiUsageLog.aggregate({
      where: { createdAt: { gte: startOfMonth }, provider: PROVIDER },
      _sum: { costToman: true },
    });
    const spent = Number(usage._sum.costToman ?? 0);
    return spent < budget;
  }

  async record(refId: string | undefined, success: boolean, costToman: number): Promise<void> {
    await this.prisma.aiUsageLog.create({
      data: {
        provider: PROVIDER,
        operation: PROVIDER,
        draftId: refId,
        costToman: success ? costToman : 0,
        success,
        note: 'برآورد تقریبی هزینه — نه رقم دقیق صورتحساب',
      },
    });
  }
}
