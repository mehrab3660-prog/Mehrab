import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { AiUsageService } from './ai-usage.service';
import { SalesAiUsageService } from './sales-ai-usage.service';
import { NewsAiUsageService } from './news-ai-usage.service';
import { StoreAiUsageService } from './store-ai-usage.service';

@Module({
  imports: [SettingsModule],
  providers: [AiUsageService, SalesAiUsageService, NewsAiUsageService, StoreAiUsageService],
  exports: [AiUsageService, SalesAiUsageService, NewsAiUsageService, StoreAiUsageService],
})
export class AiUsageModule {}
