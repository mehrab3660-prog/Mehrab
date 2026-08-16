import { Controller, Delete, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { StockSubscriptionsService } from './stock-subscriptions.service';

@Controller('products/:productId/notify-restock')
@UseGuards(JwtAuthGuard)
export class StockSubscriptionsController {
  constructor(private stockSubscriptionsService: StockSubscriptionsService) {}

  @Post()
  subscribe(@CurrentUser() user: AuthenticatedUser, @Param('productId') productId: string) {
    return this.stockSubscriptionsService.subscribe(user.id, productId);
  }

  @Delete()
  unsubscribe(@CurrentUser() user: AuthenticatedUser, @Param('productId') productId: string) {
    return this.stockSubscriptionsService.unsubscribe(user.id, productId);
  }
}
