import { Module } from '@nestjs/common';
import { AiProductController } from './ai-product.controller';
import { AiProductService } from './ai-product.service';
import { SettingsModule } from '../settings/settings.module';
import { ProductsModule } from '../catalog/products/products.module';

@Module({
  imports: [SettingsModule, ProductsModule],
  controllers: [AiProductController],
  providers: [AiProductService],
})
export class AiProductModule {}
