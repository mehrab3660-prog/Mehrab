import { Logger } from '@nestjs/common';
import { SettingsService } from '../../settings/settings.service';

export interface BackgroundRemovalProvider {
  readonly name: string;
  isConfigured(): Promise<boolean>;
  removeBackground(input: Buffer): Promise<Buffer>;
}

const BG_REMOVAL_TIMEOUT_MS = 20000;

// Safe default when no background-removal vendor is configured — the
// pipeline simply skips this step and keeps the original processed image,
// exactly as required ("if unavailable, keep the original image, do not
// fail the entire product preparation process").
export class NullBackgroundRemovalProvider implements BackgroundRemovalProvider {
  readonly name = 'none';
  async isConfigured() {
    return false;
  }
  async removeBackground(_input: Buffer): Promise<Buffer> {
    throw new Error('پس‌زمینه‌زدایی پیکربندی نشده است');
  }
}

// remove.bg — a real, documented API (multipart upload, X-Api-Key header).
// One concrete adapter behind the provider interface, swappable later.
export class RemoveBgProvider implements BackgroundRemovalProvider {
  readonly name = 'remove.bg';
  private readonly logger = new Logger(RemoveBgProvider.name);

  constructor(private apiKey: string) {}

  async isConfigured() {
    return !!this.apiKey;
  }

  async removeBackground(input: Buffer): Promise<Buffer> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), BG_REMOVAL_TIMEOUT_MS);
    try {
      const form = new FormData();
      form.append('image_file', new Blob([new Uint8Array(input)]), 'image.jpg');
      form.append('size', 'auto');

      const res = await fetch('https://api.remove.bg/v1.0/removebg', {
        method: 'POST',
        headers: { 'X-Api-Key': this.apiKey },
        body: form,
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`remove.bg failed with HTTP ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    } finally {
      clearTimeout(timeout);
    }
  }
}

export async function resolveBackgroundRemovalProvider(settings: SettingsService): Promise<BackgroundRemovalProvider> {
  const apiKey = await settings.resolve('removeBgApiKey');
  if (!apiKey) return new NullBackgroundRemovalProvider();
  return new RemoveBgProvider(apiKey);
}
