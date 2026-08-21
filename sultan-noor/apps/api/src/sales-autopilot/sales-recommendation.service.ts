import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { SalesRecommendation as SalesRecommendationModel, SalesRecommendationStatus, SalesRecommendationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { AuditLogService } from '../audit/audit-log.service';
import { SalesAiUsageService } from '../ai-usage/sales-ai-usage.service';
import { extractJsonFromModelText } from '../common/utils/extract-json.util';
import { ProductOpportunitiesService } from './product-opportunities.service';
import { SalesAnalyticsService } from './sales-analytics.service';
import { AbandonedCartInsightService } from './abandoned-cart-insight.service';
import { GenerateCampaignDto, GenerateDiscountDto, UpdateSalesRecommendationDto } from './dto/sales-recommendation.dto';

const APPROXIMATE_COST_TOMAN = 250;

const DISCOUNT_SYSTEM_PROMPT = `شما به مالک فروشگاه اینترنتی «سلطان نور» درباره‌ی یک محصول واقعی که فروش کمی داشته کمک می‌کنید.
فقط بر اساس اعداد واقعی داده‌شده تحلیل کنید — هیچ عددی که داده نشده را نسازید یا حدس نزنید.
شما اجازه‌ی تغییر قیمت واقعی را ندارید؛ فقط یک پیشنهاد برای بررسی مالک می‌سازید.
خروجی باید فقط یک JSON معتبر با این ساختار باشد، بدون هیچ متن اضافه یا Markdown:
{
  "discountPercent": عدد بین ۵ تا ۴۰,
  "suggestedDurationDays": عدد,
  "reason": "توضیح دلیل با اشاره به اعداد واقعی داده‌شده",
  "risk": "ریسک احتمالی این تخفیف"
}`;

const CAMPAIGN_SYSTEM_PROMPT = `شما به مالک فروشگاه اینترنتی «سلطان نور» (لوازم روشنایی و برقی) کمک می‌کنید یک ایده‌ی کمپین فروش بسازید.
فقط بر اساس محصولات و اعداد واقعی داده‌شده در ادامه بنویسید — هیچ آمار یا محصولی که داده نشده را نسازید.
این کمپین هرگز خودکار فعال نمی‌شود؛ فقط یک پیش‌نویس برای بررسی مالک است.
خروجی باید فقط یک JSON معتبر با این ساختار باشد، بدون هیچ متن اضافه یا Markdown:
{
  "title": "عنوان کمپین",
  "goal": "هدف کمپین",
  "audience": "مخاطب هدف",
  "suggestedDiscountPercent": عدد یا null,
  "adCopy": "متن تبلیغاتی کوتاه",
  "suggestedDurationDays": عدد,
  "reason": "چرا الان زمان مناسبی برای این کمپین است"
}`;

@Injectable()
export class SalesRecommendationService {
  private readonly logger = new Logger(SalesRecommendationService.name);

  constructor(
    private prisma: PrismaService,
    private settings: SettingsService,
    private auditLog: AuditLogService,
    private aiUsage: SalesAiUsageService,
    private opportunities: ProductOpportunitiesService,
    private analytics: SalesAnalyticsService,
    private abandonedCart: AbandonedCartInsightService,
  ) {}

  list(status?: string, type?: string) {
    return this.prisma.salesRecommendation.findMany({
      where: { ...(status ? { status: status as SalesRecommendationStatus } : {}), ...(type ? { type: type as SalesRecommendationType } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getById(id: string) {
    const rec = await this.prisma.salesRecommendation.findUnique({ where: { id } });
    if (!rec) throw new NotFoundException('پیشنهاد فروش یافت نشد');
    return rec;
  }

  // ─────────────────────────── Rule-based (no AI, always available) ───────────────────────────

  async generateCrossSellDrafts(userId?: string) {
    const pairs = await this.opportunities.crossSellPairs();
    const created: SalesRecommendationModel[] = [];
    for (const pair of pairs) {
      const existing = await this.findExistingPending('CROSS_SELL', [pair.productAId, pair.productBId]);
      if (existing) continue;
      const rec = await this.prisma.salesRecommendation.create({
        data: {
          type: 'CROSS_SELL',
          severity: pair.coOccurrence >= 5 ? 'HIGH' : 'MEDIUM',
          title: `${pair.productAName} + ${pair.productBName}`,
          reason: `این دو محصول در ${pair.coOccurrence} سفارش واقعی جداگانه با هم خریداری شده‌اند.`,
          supportingData: { coOccurrence: pair.coOccurrence },
          productIds: [pair.productAId, pair.productBId],
          confidenceNote: pair.coOccurrence >= 5 ? 'الگوی خرید مشترک قوی' : 'الگوی خرید مشترک — تعداد نمونه محدود است',
          createdByUserId: userId,
        },
      });
      created.push(rec);
    }
    return created;
  }

  async generateBundleDrafts(userId?: string) {
    const pairs = await this.opportunities.crossSellPairs(180, 3); // require a stronger signal for a named bundle
    const created: SalesRecommendationModel[] = [];
    for (const pair of pairs.slice(0, 5)) {
      const existing = await this.findExistingPending('BUNDLE', [pair.productAId, pair.productBId]);
      if (existing) continue;
      const rec = await this.prisma.salesRecommendation.create({
        data: {
          type: 'BUNDLE',
          severity: 'MEDIUM',
          title: `پک پیشنهادی: ${pair.productAName} + ${pair.productBName}`,
          reason: `این دو محصول در ${pair.coOccurrence} سفارش واقعی با هم خریداری شده‌اند — می‌توانند به‌عنوان یک پک عرضه شوند.`,
          supportingData: { coOccurrence: pair.coOccurrence },
          productIds: [pair.productAId, pair.productBId],
          payload: { items: [pair.productAId, pair.productBId] },
          confidenceNote: 'قیمت پک باید توسط مالک تعیین شود — هوش مصنوعی قیمتی پیشنهاد نمی‌دهد.',
          createdByUserId: userId,
        },
      });
      created.push(rec);
    }
    return created;
  }

  async generateAbandonedCartSuggestion(userId?: string) {
    const summary = await this.abandonedCart.summary();
    if (summary.count === 0) return null;

    const topProduct = summary.frequentProducts[0];
    const actionKind = summary.count >= 10 ? 'discount' : 'reminder';
    const reason =
      `${summary.count} سبد خرید واقعی در ۷ روز گذشته رها شده‌اند، به ارزش تقریبی ${summary.approximateValueToman.toLocaleString('fa-IR')} تومان.` +
      (topProduct ? ` پرتکرارترین محصول رهاشده: ${topProduct.name}.` : '');

    const rec = await this.prisma.salesRecommendation.create({
      data: {
        type: 'ABANDONED_CART',
        severity: summary.count >= 10 ? 'HIGH' : 'MEDIUM',
        title: `${summary.count} سبد خرید رهاشده نیاز به پیگیری دارد`,
        reason,
        supportingData: { count: summary.count, approximateValueToman: summary.approximateValueToman, frequentProducts: summary.frequentProducts },
        productIds: summary.frequentProducts.map((p) => p.productId),
        payload: { suggestedAction: actionKind },
        confidenceNote: 'ارسال هرگونه پیامک یا تخفیف نیازمند تأیید و تنظیمات جداگانه مالک است — این فقط یک پیشنهاد است.',
        createdByUserId: userId,
      },
    });
    return rec;
  }

  private async findExistingPending(type: SalesRecommendationType, productIds: string[]) {
    const candidates = await this.prisma.salesRecommendation.findMany({ where: { type, status: 'PENDING_REVIEW' } });
    const sortedTarget = [...productIds].sort().join('|');
    return candidates.find((c) => Array.isArray(c.productIds) && [...(c.productIds as string[])].sort().join('|') === sortedTarget);
  }

  // ─────────────────────────── AI-generated (requires API key + budget) ───────────────────────────

  async generateDiscount(dto: GenerateDiscountDto, userId?: string) {
    const apiKey = await this.settings.resolve('anthropicApiKey');
    if (!apiKey) throw new BadRequestException('برای این قابلیت باید کلید API هوش مصنوعی در بخش تنظیمات وارد شود.');
    if (!(await this.aiUsage.checkBudget())) throw new BadRequestException('بودجه ماهانه هوش مصنوعی فروش برای این ماه به پایان رسیده است.');

    const product = await this.prisma.product.findUnique({ where: { id: dto.productId }, select: { id: true, name: true, basePrice: true, category: { select: { name: true } } } });
    if (!product) throw new NotFoundException('محصول یافت نشد');

    const [current30d, prior30d, stock] = await Promise.all([
      this.analytics.bestSellers(30, 500).then((rows) => rows.find((r) => r.productId === dto.productId)),
      this.analytics.bestSellers(60, 500).then((rows) => rows.find((r) => r.productId === dto.productId)),
      this.opportunities.staleInventory(0).then((rows) => rows.find((r) => r.productId === dto.productId)),
    ]);
    const qty30d = current30d?.quantitySold ?? 0;
    const qtyPrior30d = Math.max((prior30d?.quantitySold ?? 0) - qty30d, 0); // the 30 days before the current window
    const stockRemaining = stock?.stockRemaining ?? null;

    let parsed: Record<string, unknown>;
    try {
      const model = (await this.settings.resolve('anthropicModel')) ?? 'claude-sonnet-4-5';
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model,
          max_tokens: 800,
          system: DISCOUNT_SYSTEM_PROMPT,
          messages: [
            {
              role: 'user',
              content: [
                `نام محصول: ${product.name}`,
                `دسته‌بندی: ${product.category?.name ?? 'ثبت نشده'}`,
                `قیمت فعلی: ${Number(product.basePrice).toLocaleString('fa-IR')} تومان`,
                `تعداد فروش واقعی در ۳۰ روز گذشته: ${qty30d} عدد`,
                `تعداد فروش واقعی در ۳۰ روز قبل از آن: ${qtyPrior30d} عدد`,
                `موجودی باقی‌مانده: ${stockRemaining ?? 'نامشخص'}`,
              ].join('\n'),
            },
          ],
        }),
      });
      const data = await res.json();
      const text = data.content?.[0]?.text;
      if (!text) throw new Error('پاسخ خالی از دستیار هوشمند');
      parsed = JSON.parse(extractJsonFromModelText(text));
    } catch (err) {
      await this.aiUsage.record(dto.productId, false, APPROXIMATE_COST_TOMAN);
      this.logger.error('Discount suggestion generation failed', err as Error);
      throw new BadRequestException('تولید پیشنهاد تخفیف ناموفق بود. لطفاً دوباره تلاش کنید.');
    }
    await this.aiUsage.record(dto.productId, true, APPROXIMATE_COST_TOMAN);

    const discountPercent = Math.min(Math.max(Number(parsed.discountPercent) || 0, 0), 70);
    const currentPrice = Number(product.basePrice);
    const suggestedFinalPrice = Math.round(currentPrice * (1 - discountPercent / 100));

    const rec = await this.prisma.salesRecommendation.create({
      data: {
        type: 'DISCOUNT',
        severity: qty30d === 0 ? 'HIGH' : 'MEDIUM',
        title: `تخفیف پیشنهادی برای ${product.name}`,
        reason: typeof parsed.reason === 'string' ? parsed.reason : `در ۳۰ روز گذشته ${qty30d} عدد فروش داشته.`,
        supportingData: { qty30d, qtyPrior30d, stockRemaining, currentPrice },
        productIds: [product.id],
        payload: {
          currentPrice,
          discountPercent,
          suggestedFinalPrice,
          suggestedDurationDays: Number(parsed.suggestedDurationDays) || undefined,
          risk: typeof parsed.risk === 'string' ? parsed.risk : undefined,
        },
        confidenceNote: 'قیمت واقعی فقط با اقدام دستی مالک در بخش قیمت‌گذاری تغییر می‌کند — این پیشنهاد چیزی را خودکار تغییر نمی‌دهد.',
        sources: ['اعداد فروش و موجودی: داده واقعی فروشگاه', 'متن دلیل و درصد پیشنهادی: تحلیل هوش مصنوعی بر پایه همان اعداد'],
        createdByUserId: userId,
      },
    });
    await this.auditLog.record({ userId, action: 'sales.discount_generated', entityType: 'SalesRecommendation', entityId: rec.id, after: rec });
    return rec;
  }

  async generateCampaign(dto: GenerateCampaignDto, userId?: string) {
    const apiKey = await this.settings.resolve('anthropicApiKey');
    if (!apiKey) throw new BadRequestException('برای این قابلیت باید کلید API هوش مصنوعی در بخش تنظیمات وارد شود.');
    if (!(await this.aiUsage.checkBudget())) throw new BadRequestException('بودجه ماهانه هوش مصنوعی فروش برای این ماه به پایان رسیده است.');

    let products: { id: string; name: string; basePrice: unknown }[] = [];
    if (dto.productIds?.length) {
      products = await this.prisma.product.findMany({ where: { id: { in: dto.productIds }, status: 'PUBLISHED' }, select: { id: true, name: true, basePrice: true } });
    } else if (dto.categoryId) {
      products = await this.prisma.product.findMany({ where: { categoryId: dto.categoryId, status: 'PUBLISHED' }, select: { id: true, name: true, basePrice: true }, take: 10 });
    }
    if (products.length === 0) throw new BadRequestException('حداقل باید یک محصول واقعی یا دسته‌بندی برای کمپین مشخص شود.');

    let parsed: Record<string, unknown>;
    try {
      const model = (await this.settings.resolve('anthropicModel')) ?? 'claude-sonnet-4-5';
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model,
          max_tokens: 1000,
          system: CAMPAIGN_SYSTEM_PROMPT,
          messages: [
            {
              role: 'user',
              content: [
                `موضوع: ${dto.topic}`,
                dto.keywords ? `کلمات کلیدی: ${dto.keywords}` : '',
                `محصولات واقعی این کمپین:\n${products.map((p) => `- ${p.name} (${Number(p.basePrice).toLocaleString('fa-IR')} تومان)`).join('\n')}`,
              ]
                .filter(Boolean)
                .join('\n'),
            },
          ],
        }),
      });
      const data = await res.json();
      const text = data.content?.[0]?.text;
      if (!text) throw new Error('پاسخ خالی از دستیار هوشمند');
      parsed = JSON.parse(extractJsonFromModelText(text));
    } catch (err) {
      await this.aiUsage.record(undefined, false, APPROXIMATE_COST_TOMAN);
      this.logger.error('Campaign suggestion generation failed', err as Error);
      throw new BadRequestException('تولید پیشنهاد کمپین ناموفق بود. لطفاً دوباره تلاش کنید.');
    }
    await this.aiUsage.record(undefined, true, APPROXIMATE_COST_TOMAN);

    const rec = await this.prisma.salesRecommendation.create({
      data: {
        type: 'CAMPAIGN',
        severity: 'MEDIUM',
        title: typeof parsed.title === 'string' ? parsed.title : dto.topic,
        reason: typeof parsed.reason === 'string' ? parsed.reason : dto.topic,
        supportingData: { productCount: products.length },
        productIds: products.map((p) => p.id),
        payload: {
          goal: parsed.goal ?? null,
          audience: parsed.audience ?? null,
          suggestedDiscountPercent: parsed.suggestedDiscountPercent ?? null,
          adCopy: parsed.adCopy ?? null,
          suggestedDurationDays: parsed.suggestedDurationDays ?? null,
        } as any,
        confidenceNote: 'این کمپین هرگز خودکار فعال نمی‌شود؛ حتی پس از تأیید، فعال‌سازی یک اقدام جداگانه و آگاهانه مالک است.',
        sources: ['فهرست محصولات: داده واقعی فروشگاه', 'متن و ایده کمپین: تولیدشده توسط هوش مصنوعی'],
        createdByUserId: userId,
      },
    });
    await this.auditLog.record({ userId, action: 'sales.campaign_generated', entityType: 'SalesRecommendation', entityId: rec.id, after: rec });
    return rec;
  }

  // ─────────────────────────── Approval workflow ───────────────────────────

  async update(id: string, dto: UpdateSalesRecommendationDto, userId?: string) {
    const before = await this.getById(id);
    if (before.status !== 'PENDING_REVIEW') throw new BadRequestException('فقط پیشنهادهای در انتظار بررسی قابل ویرایش هستند');
    const rec = await this.prisma.salesRecommendation.update({ where: { id }, data: dto as any });
    await this.auditLog.record({ userId, action: 'sales.recommendation_edited', entityType: 'SalesRecommendation', entityId: id, before, after: rec });
    return rec;
  }

  async reject(id: string, reason: string | undefined, userId?: string) {
    const before = await this.getById(id);
    if (before.status !== 'PENDING_REVIEW') throw new BadRequestException('فقط پیشنهادهای در انتظار بررسی قابل رد هستند');
    const rec = await this.prisma.salesRecommendation.update({
      where: { id },
      data: { status: 'REJECTED', rejectionReason: reason, reviewedByUserId: userId, reviewedAt: new Date() },
    });
    await this.auditLog.record({ userId, action: 'sales.recommendation_rejected', entityType: 'SalesRecommendation', entityId: id, before, after: rec });
    return rec;
  }

  // Approving NEVER mutates real price/discount/campaign/inventory state —
  // it only marks the suggestion reviewed and worth acting on. Any real
  // change (a price edit, a new discount code, a stock adjustment) is a
  // separate, manual action the admin takes in the existing admin pages.
  async approve(id: string, userId?: string) {
    const before = await this.getById(id);
    if (before.status !== 'PENDING_REVIEW') throw new BadRequestException('فقط پیشنهادهای در انتظار بررسی قابل تأیید هستند');
    const rec = await this.prisma.salesRecommendation.update({
      where: { id },
      data: { status: 'APPROVED', reviewedByUserId: userId, reviewedAt: new Date() },
    });
    await this.auditLog.record({ userId, action: 'sales.recommendation_approved', entityType: 'SalesRecommendation', entityId: id, before, after: rec });
    return rec;
  }

  // Only campaigns have an explicit APPROVED -> ACTIVE step. "Active" marks
  // this as the admin's own currently-greenlit initiative for their own
  // tracking — there is no campaign-send/execution system in this app.
  async activate(id: string, userId?: string) {
    const before = await this.getById(id);
    if (before.type !== 'CAMPAIGN') throw new BadRequestException('فقط پیشنهادهای کمپین قابل فعال‌سازی هستند');
    if (before.status !== 'APPROVED') throw new BadRequestException('فقط کمپین‌های تأییدشده قابل فعال‌سازی هستند');
    const rec = await this.prisma.salesRecommendation.update({ where: { id }, data: { status: 'ACTIVE' } });
    await this.auditLog.record({ userId, action: 'sales.campaign_activated', entityType: 'SalesRecommendation', entityId: id, before, after: rec });
    return rec;
  }
}
