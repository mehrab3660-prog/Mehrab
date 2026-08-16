import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SearchService } from '../search/search.service';
import { SettingsService } from '../settings/settings.service';
import { ImageSearchDto, VoiceSearchDto } from './dto/media-search.dto';

// Both endpoints are functional today via graceful fallbacks, with a clear
// seam for wiring in real ML providers later:
//   - Image search: without an embedding provider, falls back to newest
//     published products. TODO: compute CLIP-style embeddings for
//     Product.imageEmbedding at upload time and do a vector nearest-neighbour
//     lookup here instead of the fallback list.
//   - Voice search: transcribes via OpenAI Whisper when OPENAI_API_KEY is
//     set, then reuses the normal text search — otherwise returns a message
//     asking the shopper to type their query.
@Injectable()
export class MediaSearchService {
  private readonly logger = new Logger(MediaSearchService.name);

  constructor(
    private prisma: PrismaService,
    private search: SearchService,
    private settings: SettingsService,
  ) {}

  async searchByImage(_dto: ImageSearchDto) {
    // TODO: replace with a real visual-similarity lookup once product image
    // embeddings are populated (see Product.imageEmbedding in schema.prisma).
    const fallback = await this.prisma.product.findMany({
      where: { status: 'PUBLISHED' },
      take: 12,
      orderBy: { createdAt: 'desc' },
      include: { images: { take: 1 }, brand: true },
    });
    return {
      mode: 'fallback' as const,
      note: 'جستجوی تصویری مبتنی بر شباهت بصری هنوز پیکربندی نشده؛ محصولات پرطرفدار نمایش داده می‌شود.',
      results: fallback,
    };
  }

  async searchByVoice(dto: VoiceSearchDto) {
    const apiKey = await this.settings.resolve('openaiApiKey');
    if (!apiKey) {
      return {
        mode: 'unavailable' as const,
        note: 'جستجوی صوتی نیاز به تنظیم کلید سرویس تبدیل گفتار به متن دارد.',
        transcript: null,
        results: [],
      };
    }

    try {
      const audioBuffer = Buffer.from(dto.audioBase64, 'base64');
      const form = new FormData();
      form.append('file', new Blob([audioBuffer]), 'query.webm');
      form.append('model', 'whisper-1');

      const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
      });
      const data = await res.json();
      const transcript: string = data.text ?? '';

      const searchResult = await this.search.searchProducts(transcript, { limit: 12 });
      return { mode: 'transcribed' as const, note: null, transcript, results: searchResult.hits };
    } catch (err) {
      this.logger.error('Voice search transcription failed', err as Error);
      return { mode: 'error' as const, note: 'خطا در پردازش صدا', transcript: null, results: [] };
    }
  }
}
