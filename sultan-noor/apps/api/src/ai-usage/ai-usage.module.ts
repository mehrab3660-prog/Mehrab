import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { AiUsageService } from './ai-usage.service';

@Module({
  imports: [SettingsModule],
  providers: [AiUsageService],
  exports: [AiUsageService],
})
export class AiUsageModule {}
