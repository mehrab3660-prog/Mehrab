import { BadRequestException, Controller, Get, Post } from '@nestjs/common';
import { UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { OwnerReportService } from './owner-report.service';
import { OwnerAiSummaryService } from './owner-ai-summary.service';

// Staff-only throughout — owner/business reports are sensitive internal
// data, never reachable by a customer (§6).
@Controller('owner-report')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF)
export class OwnerReportController {
  constructor(
    private ownerReport: OwnerReportService,
    private aiSummary: OwnerAiSummaryService,
  ) {}

  @Get('daily')
  daily() {
    return this.ownerReport.dailyReport();
  }

  @Get('weekly')
  weekly() {
    return this.ownerReport.weeklyReport();
  }

  // A separate, explicit action rather than folded into GET /daily — an AI
  // call (and its real cost) only happens when the owner actually asks for
  // the plain-language narration, never on every dashboard page load.
  @Post('daily/ai-summary')
  async dailyAiSummary() {
    const report = await this.ownerReport.dailyReport();
    const summary = await this.aiSummary.summarize(report);
    return { summary };
  }

  @Post('weekly/ai-summary')
  async weeklyAiSummary() {
    const report = await this.ownerReport.weeklyReport();
    if (!report.comparisonAvailable) {
      throw new BadRequestException('داده کافی برای خلاصه هفتگی وجود ندارد.');
    }
    const summary = await this.aiSummary.summarize(report);
    return { summary };
  }
}
