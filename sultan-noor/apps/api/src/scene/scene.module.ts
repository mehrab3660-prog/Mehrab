import { Module } from '@nestjs/common';
import { SceneController } from './scene.controller';
import { SceneService } from './scene.service';
import { SettingsModule } from '../settings/settings.module';
import { ProductsModule } from '../catalog/products/products.module';

@Module({
  imports: [SettingsModule, ProductsModule],
  controllers: [SceneController],
  providers: [SceneService],
})
export class SceneModule {}
