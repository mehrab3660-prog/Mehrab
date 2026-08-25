import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { AiUsageModule } from '../ai-usage/ai-usage.module';
import { SeoAuditService } from './seo-audit.service';
import { SeoSuggestionService } from './seo-suggestion.service';
import { SeoAutopilotController } from './seo-autopilot.controller';

@Module({
  imports: [SettingsModule, AiUsageModule],
  controllers: [SeoAutopilotController],
  providers: [SeoAuditService, SeoSuggestionService],
  exports: [SeoAuditService, SeoSuggestionService],
})
export class SeoAutopilotModule {}
