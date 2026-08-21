import { Module } from '@nestjs/common';
import { AiAdvisorController } from './ai-advisor.controller';
import { AiAdvisorService } from './ai-advisor.service';
import { SettingsModule } from '../settings/settings.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ProductsModule } from '../catalog/products/products.module';
import { AiUsageModule } from '../ai-usage/ai-usage.module';

@Module({
  imports: [SettingsModule, NotificationsModule, ProductsModule, AiUsageModule],
  controllers: [AiAdvisorController],
  providers: [AiAdvisorService],
})
export class AiAdvisorModule {}
