import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { InventoryController } from './inventory.controller';
import { InventoryForecastService } from './inventory-forecast.service';
import { ReorderRecommendationService } from './reorder-recommendation.service';

@Module({
  imports: [NotificationsModule],
  controllers: [InventoryController],
  providers: [InventoryForecastService, ReorderRecommendationService],
  exports: [InventoryForecastService, ReorderRecommendationService],
})
export class InventoryModule {}
