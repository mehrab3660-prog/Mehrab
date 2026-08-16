import { Body, Controller, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { MediaSearchService } from './media-search.service';
import { ImageSearchDto, VoiceSearchDto } from './dto/media-search.dto';

// Both routes proxy to a paid external API (Whisper, etc.) once configured —
// throttled well below the global per-IP limit so this endpoint alone can't
// run up the bill.
@Controller('media-search')
@Throttle({ default: { limit: 15, ttl: 60000 } })
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
