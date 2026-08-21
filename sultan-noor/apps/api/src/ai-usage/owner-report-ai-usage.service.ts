import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';

// Owner Report's own budget pool (Sprint 8 §8/§13) — same shared AiUsageLog
// table as every other feature, its own provider key. This is the ONLY AI
// call in the Owner Report path: it narrates numbers the backend already
// computed for real, it never computes a number itself, so there is exactly
// one place cost can be incurred here.
const PROVIDER = 'owner-report-summary';

@Injectable()
export class OwnerReportAiUsageService {
  constructor(
    private prisma: PrismaService,
    private settings: SettingsService,
  ) {}

  async checkBudget(): Promise<boolean> {
    const budgetRaw = await this.settings.resolve('ownerReportAiMonthlyBudgetToman');
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

  async record(success: boolean, costToman: number): Promise<void> {
    await this.prisma.aiUsageLog.create({
      data: {
        provider: PROVIDER,
        operation: PROVIDER,
        costToman: success ? costToman : 0,
        success,
        note: 'برآورد تقریبی هزینه — نه رقم دقیق صورتحساب',
      },
    });
  }
}
