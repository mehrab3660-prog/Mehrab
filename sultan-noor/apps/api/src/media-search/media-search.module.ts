import { Module } from '@nestjs/common';
import { MediaSearchController } from './media-search.controller';
import { MediaSearchService } from './media-search.service';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [SettingsModule],
  controllers: [MediaSearchController],
  providers: [MediaSearchService],
})
export class MediaSearchModule {}
