import { Module } from '@nestjs/common';
import { WarehousesController } from './warehouses.controller';
import { WarehousesService } from './warehouses.service';
import { StockSubscriptionsModule } from '../../stock-subscriptions/stock-subscriptions.module';

@Module({
  imports: [StockSubscriptionsModule],
  controllers: [WarehousesController],
  providers: [WarehousesService],
  exports: [WarehousesService],
})
export class WarehousesModule {}
