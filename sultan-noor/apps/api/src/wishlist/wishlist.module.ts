import { Module } from '@nestjs/common';
import { WishlistController } from './wishlist.controller';
import { WishlistService } from './wishlist.service';
import { WishlistPriceAlertService } from './wishlist-price-alert.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [WishlistController],
  providers: [WishlistService, WishlistPriceAlertService],
})
export class WishlistModule {}
