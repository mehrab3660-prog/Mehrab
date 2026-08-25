import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { AiUsageService } from './ai-usage.service';
import { SalesAiUsageService } from './sales-ai-usage.service';
import { NewsAiUsageService } from './news-ai-usage.service';
import { StoreAiUsageService } from './store-ai-usage.service';
import { OwnerReportAiUsageService } from './owner-report-ai-usage.service';

@Module({
  imports: [SettingsModule],
  providers: [AiUsageService, SalesAiUsageService, NewsAiUsageService, StoreAiUsageService, OwnerReportAiUsageService],
  exports: [AiUsageService, SalesAiUsageService, NewsAiUsageService, StoreAiUsageService, OwnerReportAiUsageService],
})
export class AiUsageModule {}
