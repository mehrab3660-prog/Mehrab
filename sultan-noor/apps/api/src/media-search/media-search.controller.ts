import { Body, Controller, Post } from '@nestjs/common';
import { MediaSearchService } from './media-search.service';
import { ImageSearchDto, VoiceSearchDto } from './dto/media-search.dto';

@Controller('media-search')
export class MediaSearchController {
  constructor(private mediaSearchService: MediaSearchService) {}

  @Post('image')
  searchByImage(@Body() dto: ImageSearchDto) {
    return this.mediaSearchService.searchByImage(dto);
  }

  @Post('voice')
  searchByVoice(@Body() dto: VoiceSearchDto) {
    return this.mediaSearchService.searchByVoice(dto);
  }
}
