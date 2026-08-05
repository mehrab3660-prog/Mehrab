import { Module } from '@nestjs/common';
import { MediaSearchController } from './media-search.controller';
import { MediaSearchService } from './media-search.service';

@Module({
  controllers: [MediaSearchController],
  providers: [MediaSearchService],
})
export class MediaSearchModule {}
