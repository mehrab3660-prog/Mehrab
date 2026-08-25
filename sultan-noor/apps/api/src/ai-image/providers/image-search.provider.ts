import { Logger } from '@nestjs/common';
import { SettingsService } from '../../settings/settings.service';

export interface ImageSearchQuery {
  productName: string;
  brandName?: string;
  modelNumber?: string;
}

export interface ImageSearchCandidate {
  imageUrl: string;
  sourceUrl: string;
  sourceProvider: string;
  title?: string;
  width?: number;
  height?: number;
  // Only ever true when the provider's own response asserts an official
  // relationship — never inferred from a domain name or guessed.
  isOfficialSource: boolean;
  attribution?: string;
}

export interface ImageSearchProvider {
  readonly name: string;
  isConfigured(): Promise<boolean>;
  search(query: ImageSearchQuery, limit: number): Promise<ImageSearchCandidate[]>;
}

const SEARCH_TIMEOUT_MS = 15000;

// Never configured, never called for real — the safe default when no image
// search provider has credentials. Keeps prepare()/the autopilot working
// (with zero image candidates) instead of throwing.
export class NullImageSearchProvider implements ImageSearchProvider {
  readonly name = 'none';
  async isConfigured() {
    return false;
  }
  async search(_query: ImageSearchQuery, _limit: number): Promise<ImageSearchCandidate[]> {
    return [];
  }
}

// Bing Image Search v7 (Azure Cognitive Services) — a real, documented REST
// API with simple key-header auth. Chosen as the one concrete reference
// adapter; the ImageSearchProvider interface is what lets a different
// provider be swapped in later without touching the autopilot orchestrator.
export class BingImageSearchProvider implements ImageSearchProvider {
  readonly name = 'bing';
  private readonly logger = new Logger(BingImageSearchProvider.name);

  constructor(private apiKey: string) {}

  async isConfigured() {
    return !!this.apiKey;
  }

  async search(query: ImageSearchQuery, limit: number): Promise<ImageSearchCandidate[]> {
    const q = [query.brandName, query.productName, query.modelNumber].filter(Boolean).join(' ');
    const url = new URL('https://api.bing.microsoft.com/v7.0/images/search');
    url.searchParams.set('q', q);
    url.searchParams.set('count', String(Math.min(limit, 10)));
    url.searchParams.set('safeSearch', 'Strict');
    url.searchParams.set('imageType', 'Photo');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        headers: { 'Ocp-Apim-Subscription-Key': this.apiKey },
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Bing image search failed with HTTP ${res.status}`);
      const data = await res.json();
      const items: any[] = data.value ?? [];

      // isOfficialSource is intentionally always false here — a generic web
      // image search result carries no verifiable claim of an official
      // manufacturer/distributor relationship, and we never fabricate one.
      return items.map((item) => ({
        imageUrl: item.contentUrl,
        sourceUrl: item.hostPageUrl,
        sourceProvider: this.name,
        title: item.name,
        width: item.width,
        height: item.height,
        isOfficialSource: false,
        attribution: item.hostPageDisplayUrl,
      }));
    } catch (err) {
      this.logger.warn(`Bing image search failed: ${(err as Error).message}`);
      return [];
    } finally {
      clearTimeout(timeout);
    }
  }
}

export async function resolveImageSearchProvider(settings: SettingsService): Promise<ImageSearchProvider> {
  const providerName = (await settings.resolve('imageSearchProvider')) ?? 'bing';
  const apiKey = await settings.resolve('imageSearchApiKey');
  if (!apiKey) return new NullImageSearchProvider();
  if (providerName === 'bing') return new BingImageSearchProvider(apiKey);
  return new NullImageSearchProvider();
}
