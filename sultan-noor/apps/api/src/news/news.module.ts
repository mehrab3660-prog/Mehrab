import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { AiUsageModule } from '../ai-usage/ai-usage.module';
import { BlogModule } from '../blog/blog.module';
import { AiImageModule } from '../ai-image/ai-image.module';
import { NewsController } from './news.controller';
import { NewsSourceService } from './news-source.service';
import { NewsVerificationService } from './news-verification.service';
import { NewsContentService } from './news-content.service';
import { NewsImageService } from './news-image.service';

@Module({
  imports: [SettingsModule, AiUsageModule, BlogModule, AiImageModule],
  controllers: [NewsController],
  providers: [NewsSourceService, NewsVerificationService, NewsContentService, NewsImageService],
  exports: [NewsSourceService, NewsVerificationService, NewsContentService],
})
export class NewsModule {}
