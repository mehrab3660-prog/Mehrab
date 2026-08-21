import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { AiUsageModule } from '../ai-usage/ai-usage.module';
import { BlogModule } from '../blog/blog.module';
import { ProductsModule } from '../catalog/products/products.module';
import { ContentAutopilotService } from './content-autopilot.service';
import { ContentAutopilotController } from './content-autopilot.controller';

@Module({
  imports: [SettingsModule, AiUsageModule, BlogModule, ProductsModule],
  controllers: [ContentAutopilotController],
  providers: [ContentAutopilotService],
  exports: [ContentAutopilotService],
})
export class ContentAutopilotModule {}
