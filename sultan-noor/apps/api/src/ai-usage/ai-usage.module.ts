import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { AiUsageService } from './ai-usage.service';
import { SalesAiUsageService } from './sales-ai-usage.service';

@Module({
  imports: [SettingsModule],
  providers: [AiUsageService, SalesAiUsageService],
  exports: [AiUsageService, SalesAiUsageService],
})
export class AiUsageModule {}
