import { Logger } from '@nestjs/common';
import { SettingsService } from '../../settings/settings.service';

export interface GeneratedImage {
  buffer: Buffer;
  provider: string;
  promptVersion: string;
  prompt: string;
}

export interface ImageGenerationProvider {
  readonly name: string;
  isConfigured(): Promise<boolean>;
  generate(prompt: string): Promise<GeneratedImage>;
}

const GENERATION_TIMEOUT_MS = 45000;

// Bumped only when buildSafeProductVisualPrompt's wording changes in a way
// that could affect output — recorded on every generated image so a later
// audit can tell exactly what instructions produced it.
export const PRODUCT_VISUAL_PROMPT_VERSION = 'product-visual-v1';

// Deliberately generic/unbranded: never asks for a logo, brand mark, printed
// text, certification badge, or packaging — the model cannot be trusted to
// reproduce those accurately, and a wrong one would be actively misleading.
export function buildSafeProductVisualPrompt(query: { productName: string; categoryName?: string | null }): string {
  const subject = query.categoryName ? `${query.productName} (a ${query.categoryName})` : query.productName;
  return [
    `Professional studio product photograph of a generic, unbranded ${subject}.`,
    'Plain neutral light-gray background, soft even studio lighting, centered composition, realistic proportions and materials.',
    'Absolutely no text, no logos, no brand marks, no labels, no certification badges or stickers, no packaging, no watermarks.',
    'Photorealistic, commercial e-commerce catalog style.',
  ].join(' ');
}

export class NullImageGenerationProvider implements ImageGenerationProvider {
  readonly name = 'none';
  async isConfigured() {
    return false;
  }
  async generate(_prompt: string): Promise<GeneratedImage> {
    throw new Error('تولید تصویر با هوش مصنوعی پیکربندی نشده است');
  }
}

// OpenAI Images API — reuses the same openaiApiKey setting already used
// elsewhere in this app (media-search voice transcription), so no new key
// needs to be collected for a store that already uses OpenAI for anything else.
export class OpenAiImageGenerationProvider implements ImageGenerationProvider {
  readonly name = 'openai';
  private readonly logger = new Logger(OpenAiImageGenerationProvider.name);

  constructor(private apiKey: string) {}

  async isConfigured() {
    return !!this.apiKey;
  }

  async generate(prompt: string): Promise<GeneratedImage> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GENERATION_TIMEOUT_MS);
    try {
      const res = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({ model: 'gpt-image-1', prompt, size: '1024x1024', n: 1 }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`OpenAI image generation failed with HTTP ${res.status}`);
      const data = await res.json();
      const item = data.data?.[0];
      if (!item) throw new Error('پاسخ خالی از سرویس تولید تصویر');

      let buffer: Buffer;
      if (item.b64_json) {
        buffer = Buffer.from(item.b64_json, 'base64');
      } else if (item.url) {
        const imgRes = await fetch(item.url, { signal: controller.signal });
        if (!imgRes.ok) throw new Error('دریافت تصویر تولیدشده ناموفق بود');
        buffer = Buffer.from(await imgRes.arrayBuffer());
      } else {
        throw new Error('پاسخ سرویس تولید تصویر قابل تفسیر نیست');
      }

      return { buffer, provider: this.name, promptVersion: PRODUCT_VISUAL_PROMPT_VERSION, prompt };
    } finally {
      clearTimeout(timeout);
    }
  }
}

export async function resolveImageGenerationProvider(settings: SettingsService): Promise<ImageGenerationProvider> {
  const providerName = (await settings.resolve('imageGenerationProvider')) ?? 'openai';
  const apiKey = await settings.resolve('openaiApiKey');
  if (!apiKey) return new NullImageGenerationProvider();
  if (providerName === 'openai') return new OpenAiImageGenerationProvider(apiKey);
  return new NullImageGenerationProvider();
}
