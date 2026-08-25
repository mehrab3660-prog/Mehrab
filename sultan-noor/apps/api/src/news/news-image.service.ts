import { Injectable, Logger } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';
import { ImageProcessingService } from '../ai-image/image-processing.service';
import { fetchImageSafely } from '../ai-image/util/safe-image-fetch';
import { validateImageBuffer } from '../ai-image/util/image-validation';
import { resolveImageSearchProvider } from '../ai-image/providers/image-search.provider';
import { resolveImageGenerationProvider } from '../ai-image/providers/image-generation.provider';

export interface ResolvedNewsImage {
  imageUrl: string;
  imageSource: 'SOURCE' | 'SOURCE_SEARCH' | 'AI_GENERATED';
  imageIsAiGenerated: boolean;
  imageAttribution: string | null;
}

// Deliberately generic/editorial: never asks for a real logo, brand mark,
// identifiable person, or a depiction of a specific real event — the model
// cannot be trusted to render those accurately, and a wrong one would be
// actively misleading in a news context.
function buildSafeNewsVisualPrompt(headline: string): string {
  return [
    `Editorial illustration representing the general theme of this electrical/smart-building news headline: "${headline}".`,
    'Abstract or symbolic composition — generic electrical equipment, wiring, lighting, or smart-home iconography.',
    'Absolutely no real company logos, no brand marks, no readable text, no identifiable real people, no depiction of a specific real event or location.',
    'Clean, professional, editorial-illustration style suitable for a technology news article.',
  ].join(' ');
}

// Reuses every piece of Sprint 2's image pipeline as-is: the same SSRF-safe
// fetch, the same sharp-based format/dimension validation, the same search/
// generation provider adapters, and the same on-disk processing + static
// serving path — nothing news-specific was rebuilt here.
@Injectable()
export class NewsImageService {
  private readonly logger = new Logger(NewsImageService.name);

  constructor(
    private settings: SettingsService,
    private imageProcessing: ImageProcessingService,
  ) {}

  async resolveImage(item: { rawTitle: string; imageUrl?: string | null }, baseUrl: string): Promise<ResolvedNewsImage | null> {
    // Priority 1: a real image the source feed itself provided.
    if (item.imageUrl) {
      const result = await this.tryDownload(item.imageUrl, baseUrl, 'SOURCE', item.imageUrl);
      if (result) return result;
    }

    // Priority 2: a real web image, found by searching the headline.
    const searchProvider = await resolveImageSearchProvider(this.settings);
    if (await searchProvider.isConfigured()) {
      const candidates = await searchProvider.search({ productName: item.rawTitle }, 5);
      for (const candidate of candidates) {
        const result = await this.tryDownload(candidate.imageUrl, baseUrl, 'SOURCE_SEARCH', candidate.sourceUrl);
        if (result) return result;
      }
    }

    // Priority 3: AI-generated, always clearly marked as such.
    const generationProvider = await resolveImageGenerationProvider(this.settings);
    if (await generationProvider.isConfigured()) {
      try {
        const generated = await generationProvider.generate(buildSafeNewsVisualPrompt(item.rawTitle));
        const processed = await this.imageProcessing.processForCatalog(generated.buffer, baseUrl);
        return { imageUrl: processed.url, imageSource: 'AI_GENERATED', imageIsAiGenerated: true, imageAttribution: null };
      } catch (err) {
        this.logger.warn(`News AI image generation failed: ${(err as Error).message}`);
      }
    }

    // No real image found and no generation provider configured — an
    // honest "no image" beats fabricating one.
    return null;
  }

  private async tryDownload(url: string, baseUrl: string, source: 'SOURCE' | 'SOURCE_SEARCH', attribution: string | null): Promise<ResolvedNewsImage | null> {
    try {
      const { buffer } = await fetchImageSafely(url);
      const validation = await validateImageBuffer(buffer);
      if (!validation.ok) return null;
      const processed = await this.imageProcessing.processForCatalog(buffer, baseUrl);
      return { imageUrl: processed.url, imageSource: source, imageIsAiGenerated: false, imageAttribution: attribution };
    } catch (err) {
      this.logger.warn(`News image download failed for ${url}: ${(err as Error).message}`);
      return null;
    }
  }
}
