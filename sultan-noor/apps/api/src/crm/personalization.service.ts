import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProductsService } from '../catalog/products/products.service';
import { REAL_SALE_STATUSES } from '../common/constants/order-status';

const RECOMMENDATION_LIMIT = 8;

// Store-only, catalog-grounded personalization (Sprint 8 §5) — structurally
// the same guarantee as the Sprint 6 Store-only AI: every recommended
// product always comes from ProductsService.list()/getManyByIds() (a real,
// live, PUBLISHED-only Catalog read), never an external site, and never an
// LLM. Sources are only real past purchases and real product-view activity
// for THIS caller's own userId — never another customer's data, and never
// a client-supplied "recommend for user X" parameter.
@Injectable()
export class PersonalizationService {
  constructor(
    private prisma: PrismaService,
    private products: ProductsService,
  ) {}

  async recommendationsForUser(userId: string) {
    const [purchasedCategoryIds, purchasedProductIds, viewedCategoryIds] = await Promise.all([
      this.realPurchasedCategoryIds(userId),
      this.realPurchasedProductIds(userId),
      this.realViewedCategoryIds(userId),
    ]);

    const candidateCategoryIds = Array.from(new Set([...purchasedCategoryIds, ...viewedCategoryIds]));

    if (candidateCategoryIds.length === 0) {
      // No real personal signal yet — an honest, still fully real fallback:
      // real site-wide bestsellers, never a fabricated "for you" pick.
      const bestSellers = await this.products.bestSellers(RECOMMENDATION_LIMIT);
      return { personalized: false, source: 'BESTSELLERS' as const, products: bestSellers };
    }

    const candidates = await this.prisma.product.findMany({
      where: { status: 'PUBLISHED', categoryId: { in: candidateCategoryIds }, id: { notIn: purchasedProductIds } },
      select: { id: true },
      take: 60,
    });

    if (candidates.length === 0) {
      const bestSellers = await this.products.bestSellers(RECOMMENDATION_LIMIT);
      return { personalized: false, source: 'BESTSELLERS' as const, products: bestSellers };
    }

    const hydrated = await this.products.getManyByIds(candidates.map((c) => c.id));
    const ranked = hydrated.sort((a, b) => (b.avgRating ?? 0) - (a.avgRating ?? 0) || b.totalStock - a.totalStock).slice(0, RECOMMENDATION_LIMIT);

    return { personalized: true, source: 'PURCHASE_HISTORY' as const, products: ranked };
  }

  private async realPurchasedProductIds(userId: string): Promise<string[]> {
    const items = await this.prisma.orderItem.findMany({
      where: { order: { userId, status: { in: REAL_SALE_STATUSES } } },
      select: { productId: true },
      distinct: ['productId'],
    });
    return items.map((i) => i.productId);
  }

  private async realPurchasedCategoryIds(userId: string): Promise<string[]> {
    const items = await this.prisma.orderItem.findMany({
      where: { order: { userId, status: { in: REAL_SALE_STATUSES } } },
      select: { product: { select: { categoryId: true } } },
    });
    return Array.from(new Set(items.map((i) => i.product?.categoryId).filter((id): id is string => !!id)));
  }

  // Real product.view ActivityLog events (recorded in ProductsService.get())
  // for this user, resolved to their real categories — a genuine "actual
  // site behavior" signal, never fabricated.
  private async realViewedCategoryIds(userId: string): Promise<string[]> {
    const views = await this.prisma.activityLog.findMany({
      where: { userId, event: 'product.view' },
      select: { metadata: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    const productIds = Array.from(new Set(views.map((v) => (v.metadata as any)?.productId).filter((id): id is string => !!id)));
    if (productIds.length === 0) return [];
    const products = await this.prisma.product.findMany({ where: { id: { in: productIds } }, select: { categoryId: true } });
    return Array.from(new Set(products.map((p) => p.categoryId).filter((id): id is string => !!id)));
  }
}
