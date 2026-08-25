import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiProductService } from '../ai-product/ai-product.service';
import { SeoSuggestionService } from '../seo-autopilot/seo-suggestion.service';
import { ContentAutopilotService } from '../content-autopilot/content-autopilot.service';
import { SalesRecommendationService } from '../sales-autopilot/sales-recommendation.service';
import { NewsContentService } from '../news/news-content.service';
import { ReorderRecommendationService } from '../inventory/reorder-recommendation.service';

export type ApprovalItemType = 'PRODUCT_DRAFT' | 'SEO_SUGGESTION' | 'CONTENT_DRAFT' | 'SALES_RECOMMENDATION' | 'NEWS_ITEM' | 'REORDER_RECOMMENDATION';

export interface ApprovalItem {
  id: string;
  type: ApprovalItemType;
  title: string;
  createdAt: Date;
  status: 'PENDING_REVIEW';
}

// Sprint 8 §11 "کارهای آماده تأیید" — a pure aggregation READ over every
// existing approval-workflow table (never a new parallel status model), and
// a thin approve/reject dispatcher that always delegates to that domain's
// own already-tested service. No approval/publish/price/stock logic is
// duplicated or reimplemented here — this module only routes to it.
@Injectable()
export class ApprovalCenterService {
  constructor(
    private prisma: PrismaService,
    private aiProduct: AiProductService,
    private seoSuggestion: SeoSuggestionService,
    private contentAutopilot: ContentAutopilotService,
    private salesRecommendation: SalesRecommendationService,
    private newsContent: NewsContentService,
    private reorderRecommendation: ReorderRecommendationService,
  ) {}

  async list() {
    const [productDrafts, seoSuggestionsRaw, contentDrafts, salesRecommendations, newsItems, reorderRecommendations] = await Promise.all([
      this.prisma.productAiDraft.findMany({ where: { status: 'PENDING_REVIEW' }, select: { id: true, name: true, createdAt: true }, orderBy: { createdAt: 'desc' } }),
      this.prisma.productSeoSuggestion.findMany({
        where: { status: 'PENDING_REVIEW' },
        select: { id: true, productId: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.contentDraft.findMany({ where: { status: 'PENDING_REVIEW' }, select: { id: true, title: true, topic: true, createdAt: true }, orderBy: { createdAt: 'desc' } }),
      this.prisma.salesRecommendation.findMany({ where: { status: 'PENDING_REVIEW' }, select: { id: true, title: true, createdAt: true }, orderBy: { createdAt: 'desc' } }),
      this.prisma.newsItem.findMany({ where: { status: 'PENDING_REVIEW' }, select: { id: true, draftTitle: true, rawTitle: true, createdAt: true }, orderBy: { createdAt: 'desc' } }),
      this.prisma.reorderRecommendation.findMany({ where: { status: 'PENDING_REVIEW' }, select: { id: true, productName: true, createdAt: true }, orderBy: { createdAt: 'desc' } }),
    ]);

    // ProductSeoSuggestion has no Prisma relation to Product (plain string
    // FK, same convention as every other lower-coupled Sprint 8 link) — the
    // product name is fetched separately, same pattern DashboardService's
    // aiControlCenter already uses for this exact table.
    const seoProductIds = seoSuggestionsRaw.map((s) => s.productId);
    const seoProducts = seoProductIds.length ? await this.prisma.product.findMany({ where: { id: { in: seoProductIds } }, select: { id: true, name: true } }) : [];
    const seoProductNameById = new Map(seoProducts.map((p) => [p.id, p.name]));

    const items: ApprovalItem[] = [
      ...productDrafts.map((d) => ({ id: d.id, type: 'PRODUCT_DRAFT' as const, title: d.name, createdAt: d.createdAt, status: 'PENDING_REVIEW' as const })),
      ...seoSuggestionsRaw.map((s) => ({ id: s.id, type: 'SEO_SUGGESTION' as const, title: `سئو: ${seoProductNameById.get(s.productId) ?? 'محصول حذف‌شده'}`, createdAt: s.createdAt, status: 'PENDING_REVIEW' as const })),
      ...contentDrafts.map((c) => ({ id: c.id, type: 'CONTENT_DRAFT' as const, title: c.title ?? c.topic, createdAt: c.createdAt, status: 'PENDING_REVIEW' as const })),
      ...salesRecommendations.map((r) => ({ id: r.id, type: 'SALES_RECOMMENDATION' as const, title: r.title, createdAt: r.createdAt, status: 'PENDING_REVIEW' as const })),
      ...newsItems.map((n) => ({ id: n.id, type: 'NEWS_ITEM' as const, title: n.draftTitle ?? n.rawTitle, createdAt: n.createdAt, status: 'PENDING_REVIEW' as const })),
      ...reorderRecommendations.map((r) => ({ id: r.id, type: 'REORDER_RECOMMENDATION' as const, title: `تجدید موجودی: ${r.productName}`, createdAt: r.createdAt, status: 'PENDING_REVIEW' as const })),
    ];
    items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const counts: Record<ApprovalItemType, number> = {
      PRODUCT_DRAFT: productDrafts.length,
      SEO_SUGGESTION: seoSuggestionsRaw.length,
      CONTENT_DRAFT: contentDrafts.length,
      SALES_RECOMMENDATION: salesRecommendations.length,
      NEWS_ITEM: newsItems.length,
      REORDER_RECOMMENDATION: reorderRecommendations.length,
    };

    return { items, counts, total: items.length };
  }

  // A quick "approve as-is" for the Approval Center's own list view. Product
  // drafts and content drafts approved here always create as DRAFT/unpublished
  // (never auto-publish) since no explicit publish choice was made — an
  // admin who wants to publish still uses that item's own dedicated review
  // page, exactly as before this module existed.
  async approve(type: ApprovalItemType, id: string, userId?: string) {
    switch (type) {
      case 'PRODUCT_DRAFT':
        return this.aiProduct.approve(id, {}, userId);
      case 'SEO_SUGGESTION':
        return this.seoSuggestion.approve(id, userId);
      case 'CONTENT_DRAFT':
        return this.contentAutopilot.approve(id, {}, userId);
      case 'SALES_RECOMMENDATION':
        return this.salesRecommendation.approve(id, userId);
      case 'NEWS_ITEM':
        return this.newsContent.approve(id, userId);
      case 'REORDER_RECOMMENDATION':
        return this.reorderRecommendation.approve(id, userId);
      default:
        throw new BadRequestException('نوع مورد تأیید نامعتبر است');
    }
  }

  async reject(type: ApprovalItemType, id: string, reason: string | undefined, userId?: string) {
    switch (type) {
      case 'PRODUCT_DRAFT':
        return this.aiProduct.reject(id, reason, userId);
      case 'SEO_SUGGESTION':
        return this.seoSuggestion.reject(id, reason, userId);
      case 'CONTENT_DRAFT':
        return this.contentAutopilot.reject(id, reason, userId);
      case 'SALES_RECOMMENDATION':
        return this.salesRecommendation.reject(id, reason, userId);
      case 'NEWS_ITEM':
        return this.newsContent.reject(id, reason, userId);
      case 'REORDER_RECOMMENDATION':
        return this.reorderRecommendation.reject(id, reason, userId);
      default:
        throw new BadRequestException('نوع مورد تأیید نامعتبر است');
    }
  }
}
