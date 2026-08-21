import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';

// News Autopilot's own budget pool — same shared AiUsageLog table as every
// other Autopilot, scoped to its own provider key and budget setting.
// Discovery and verification are rule-based and never touch this budget;
// only draft translation/rewriting calls the AI provider.
const PROVIDER = 'news-generation';

@Injectable()
export class NewsAiUsageService {
  constructor(
    private prisma: PrismaService,
    private settings: SettingsService,
  ) {}

  async checkBudget(): Promise<boolean> {
    const budgetRaw = await this.settings.resolve('newsMonthlyBudgetToman');
    if (!budgetRaw) return true;
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
