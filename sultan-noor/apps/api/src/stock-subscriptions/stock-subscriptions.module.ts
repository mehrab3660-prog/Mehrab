import { Module } from '@nestjs/common';
import { StockSubscriptionsController } from './stock-subscriptions.controller';
import { StockSubscriptionsService } from './stock-subscriptions.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [StockSubscriptionsController],
  providers: [StockSubscriptionsService],
  exports: [StockSubscriptionsService],
})
export class StockSubscriptionsModule {}
