import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MeiliSearch, Index } from 'meilisearch';

export interface ProductSearchDocument {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  brandName: string | null;
  categoryName: string | null;
  basePrice: number;
  status: string;
  imageUrl: string | null;
}

// Wraps Meilisearch for fast typo-tolerant text search ("smart search").
// Image search and voice search (see MediaSearchModule) reduce to this same
// text index once the image is captioned / the audio is transcribed.
@Injectable()
export class SearchService implements OnModuleInit {
  private readonly logger = new Logger(SearchService.name);
  private client: MeiliSearch | null = null;
  private productsIndex: Index<ProductSearchDocument> | null = null;

  async onModuleInit() {
    const host = process.env.MEILISEARCH_HOST;
    if (!host) {
      this.logger.warn('MEILISEARCH_HOST تنظیم نشده؛ جستجوی متنی غیرفعال است.');
      return;
    }

    this.client = new MeiliSearch({ host, apiKey: process.env.MEILISEARCH_API_KEY });
    this.productsIndex = this.client.index<ProductSearchDocument>('products');

    try {
      await this.productsIndex.updateSettings({
        searchableAttributes: ['name', 'description', 'brandName', 'categoryName'],
        filterableAttributes: ['status', 'brandName', 'categoryName'],
        sortableAttributes: ['basePrice'],
      });
    } catch (err) {
      // Meilisearch being unreachable at boot must never crash the whole API
      // (product/cart/order CRUD don't depend on it) — degrade gracefully.
      this.logger.error(`اتصال به Meilisearch برقرار نشد؛ جستجوی متنی موقتاً غیرفعال است: ${(err as Error).message}`);
    }
  }

  async indexProduct(doc: ProductSearchDocument) {
    if (!this.productsIndex) return;
    try {
      await this.productsIndex.addDocuments([doc]);
    } catch (err) {
      this.logger.warn(`نمایه‌سازی محصول در Meilisearch ناموفق بود: ${(err as Error).message}`);
    }
  }

  async removeProduct(id: string) {
    if (!this.productsIndex) return;
    try {
      await this.productsIndex.deleteDocument(id);
    } catch (err) {
      this.logger.warn(`حذف محصول از Meilisearch ناموفق بود: ${(err as Error).message}`);
    }
  }

  async searchProducts(query: string, opts: { limit?: number; filter?: string } = {}) {
    if (!this.productsIndex) return { hits: [], estimatedTotalHits: 0 };
    try {
      return await this.productsIndex.search(query, { limit: opts.limit ?? 20, filter: opts.filter });
    } catch (err) {
      this.logger.warn(`جستجو در Meilisearch ناموفق بود: ${(err as Error).message}`);
      return { hits: [], estimatedTotalHits: 0 };
    }
  }
}
