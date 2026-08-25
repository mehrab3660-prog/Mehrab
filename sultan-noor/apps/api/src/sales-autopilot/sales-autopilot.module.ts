import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { AiUsageModule } from '../ai-usage/ai-usage.module';
import { SalesAutopilotController } from './sales-autopilot.controller';
import { SalesAnalyticsService } from './sales-analytics.service';
import { ProductOpportunitiesService } from './product-opportunities.service';
import { AbandonedCartInsightService } from './abandoned-cart-insight.service';
import { SalesRecommendationService } from './sales-recommendation.service';

@Module({
  imports: [SettingsModule, AiUsageModule],
  controllers: [SalesAutopilotController],
  providers: [SalesAnalyticsService, ProductOpportunitiesService, AbandonedCartInsightService, SalesRecommendationService],
  exports: [SalesAnalyticsService, ProductOpportunitiesService, AbandonedCartInsightService, SalesRecommendationService],
})
export class SalesAutopilotModule {}
