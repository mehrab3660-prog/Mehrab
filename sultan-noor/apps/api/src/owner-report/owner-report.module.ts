import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { AiUsageModule } from '../ai-usage/ai-usage.module';
import { SalesAutopilotModule } from '../sales-autopilot/sales-autopilot.module';
import { InventoryModule } from '../inventory/inventory.module';
import { OwnerReportController } from './owner-report.controller';
import { OwnerReportService } from './owner-report.service';
import { OwnerAiSummaryService } from './owner-ai-summary.service';

@Module({
  imports: [SettingsModule, AiUsageModule, SalesAutopilotModule, InventoryModule],
  controllers: [OwnerReportController],
  providers: [OwnerReportService, OwnerAiSummaryService],
  exports: [OwnerReportService, OwnerAiSummaryService],
})
export class OwnerReportModule {}
