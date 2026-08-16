import { Module } from '@nestjs/common';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';
import { CartRecoveryService } from './cart-recovery.service';
import { ProductsModule } from '../catalog/products/products.module';
import { AuthModule } from '../auth/auth.module';
import { PricingModule } from '../pricing/pricing.module';

@Module({
  imports: [ProductsModule, AuthModule, PricingModule],
  controllers: [CartController],
  providers: [CartService, CartRecoveryService],
})
export class CartModule {}
