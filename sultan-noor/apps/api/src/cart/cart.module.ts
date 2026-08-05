import { Module } from '@nestjs/common';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';
import { ProductsModule } from '../catalog/products/products.module';

@Module({
  imports: [ProductsModule],
  controllers: [CartController],
  providers: [CartService],
})
export class CartModule {}
