import { Module } from '@nestjs/common';
import { AiProductController } from './ai-product.controller';
import { AiProductService } from './ai-product.service';
import { SettingsModule } from '../settings/settings.module';
import { ProductsModule } from '../catalog/products/products.module';
import { AiImageModule } from '../ai-image/ai-image.module';

@Module({
  imports: [SettingsModule, ProductsModule, AiImageModule],
  controllers: [AiProductController],
  providers: [AiProductService],
  exports: [AiProductService],
})
export class AiProductModule {}
