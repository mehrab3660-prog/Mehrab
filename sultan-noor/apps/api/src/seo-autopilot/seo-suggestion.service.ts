import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { AuditLogService } from '../audit/audit-log.service';
import { AiUsageService } from '../ai-usage/ai-usage.service';
import { extractJsonFromModelText } from '../common/utils/extract-json.util';
import { UpdateSeoSuggestionDto } from './dto/seo-suggestion.dto';

// Rough, static per-call cost estimate in Toman — same honest-approximation
// convention as Image Autopilot's APPROXIMATE_COST_TOMAN.
const APPROXIMATE_COST_TOMAN = 250;

// Auto-fix (applyLowRiskAutoFix below) only ever touches metaDescription,
// searchKeywords, and image altText — small, reversible, non-visible-identity
// changes. metaTitle, h1Suggestion, and descriptionSuggestion are NEVER
// auto-applied regardless of AppSettings.seoAutoFixEnabled; they always
// require an explicit admin approve(). h1Suggestion is informational-only
// and never written anywhere — Product.name (the real H1) is only ever
// edited through the normal product form, never through this pipeline.

const SEO_SUGGESTION_SYSTEM_PROMPT = `شما به فروشگاه اینترنتی «سلطان نور» کمک می‌کنید تا سئوی یک محصول واقعاً موجود را بهبود دهید.
فقط بر اساس اطلاعات واقعی محصول که در ادامه آمده پیشنهاد بدهید.

قوانین مهم:
- هرگز مشخصات فنی، قیمت یا هر عددی که در اطلاعات داده‌شده نیست را حدس نزنید یا نسازید.
- h1Suggestion فقط جنبه‌ی اطلاع‌رسانی دارد و مستقیماً روی نام محصول اعمال نمی‌شود — می‌توانید پیشنهاد بدهید اما نباید مطمئن به اعمال آن باشید.
- internalLinks را فقط از فهرست «لینک‌های مجاز» که در ادامه آمده انتخاب کنید — هرگز آدرس جدیدی نسازید.
- altTextSuggestions باید یک شیء JSON باشد که کلیدهای آن دقیقاً همان اندیس‌های عددی تصاویر (index) در فهرست تصاویر داده‌شده باشد.
- خروجی باید فقط یک JSON معتبر با این ساختار باشد، بدون هیچ متن اضافه یا Markdown:
{
  "metaTitle": "عنوان سئو زیر ۶۰ کاراکتر یا null",
  "metaDescription": "توضیح متا بین ۵۰ تا ۱۶۰ کاراکتر یا null",
  "searchKeywords": "چند کلمه کلیدی با کاما جدا شده یا null",
  "h1Suggestion": "پیشنهاد عنوان محصول (فقط اطلاعاتی) یا null",
  "descriptionSuggestion": "توضیحات محصول بهبودیافته یا null",
  "faq": [{ "q": "سوال", "a": "پاسخ" }],
  "altTextSuggestions": { "0": "توضیح تصویر اول", "1": "توضیح تصویر دوم" },
  "internalLinks": [{ "label": "متن لینک", "url": "دقیقاً یکی از لینک‌های مجاز" }],
  "confidenceNote": "هرچه نامطمئن است یا نیاز به بررسی مدیر دارد"
}`;

@Injectable()
export class SeoSuggestionService {
  private readonly logger = new Logger(SeoSuggestionService.name);

  constructor(
    private prisma: PrismaService,
    private settings: SettingsService,
    private auditLog: AuditLogService,
    private aiUsage: AiUsageService,
  ) {}

  listForProduct(productId: string) {
    return this.prisma.productSeoSuggestion.findMany({ where: { productId }, orderBy: { createdAt: 'desc' } });
  }

  async getSuggestion(id: string) {
    const suggestion = await this.prisma.productSeoSuggestion.findUnique({ where: { id } });
    if (!suggestion) throw new NotFoundException('پیشنهاد سئو یافت نشد');
    return suggestion;
  }

  async generate(productId: string, userId?: string) {
    const apiKey = await this.settings.resolve('anthropicApiKey');
    if (!apiKey) throw new BadRequestException('برای این قابلیت باید کلید API هوش مصنوعی در بخش تنظیمات وارد شود.');

    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        name: true,
        description: true,
        basePrice: true,
        metaTitle: true,
        metaDescription: true,
        searchKeywords: true,
        categoryId: true,
        brand: { select: { name: true } },
        category: { select: { name: true } },
        images: { select: { id: true, altText: true }, orderBy: { position: 'asc' } },
      },
    });
    if (!product) throw new NotFoundException('محصول یافت نشد');

    if (!(await this.aiUsage.checkBudget())) {
      throw new BadRequestException('بودجه ماهانه سئو/محتوا برای این ماه به پایان رسیده است.');
    }

    const allowedLinks = await this.buildAllowedLinks(productId, product.categoryId);

    let parsed: Record<string, unknown>;
    try {
      const model = (await this.settings.resolve('anthropicModel')) ?? 'claude-sonnet-4-5';
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model,
          max_tokens: 1500,
          system: SEO_SUGGESTION_SYSTEM_PROMPT,
          messages: [
            {
              role: 'user',
              content: [
                `نام محصول: ${product.name}`,
                `برند: ${product.brand?.name ?? 'ثبت نشده'}`,
                `دسته‌بندی: ${product.category?.name ?? 'ثبت نشده'}`,
                `قیمت: ${Number(product.basePrice).toLocaleString('fa-IR')} تومان`,
                `توضیحات فعلی: ${product.description ?? 'ثبت نشده'}`,
                `عنوان سئوی فعلی: ${product.metaTitle ?? 'ثبت نشده'}`,
                `توضیح متای فعلی: ${product.metaDescription ?? 'ثبت نشده'}`,
                `تصاویر (اندیس: متن جایگزین فعلی): ${product.images.map((img, i) => `${i}: ${img.altText ?? 'ثبت نشده'}`).join(' | ') || 'بدون تصویر'}`,
                `لینک‌های مجاز برای internalLinks:\n${JSON.stringify(allowedLinks)}`,
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
      await this.aiUsage.record('seo-generation', productId, false, APPROXIMATE_COST_TOMAN);
      this.logger.error('SEO suggestion generation failed', err as Error);
      throw new BadRequestException('تولید پیشنهاد سئو ناموفق بود. لطفاً دوباره تلاش کنید.');
    }
    await this.aiUsage.record('seo-generation', productId, true, APPROXIMATE_COST_TOMAN);

    // Map index-keyed altTextSuggestions back to real ProductImage ids —
    // never trust an id the model might have invented.
    const altTextByIndex = (parsed.altTextSuggestions as Record<string, string>) ?? {};
    const altTextSuggestions: Record<string, string> = {};
    for (const [indexStr, text] of Object.entries(altTextByIndex)) {
      const index = Number(indexStr);
      const image = product.images[index];
      if (image && typeof text === 'string') altTextSuggestions[image.id] = text;
    }

    // Defense in depth: drop any internal link the model proposed that
    // isn't in the allow-list we ourselves built from real data — the
    // prompt asks for this too, but this is the actual enforcement.
    const allowedUrls = new Set(allowedLinks.map((l) => l.url));
    const internalLinks = Array.isArray(parsed.internalLinks)
      ? (parsed.internalLinks as { label?: string; url?: string }[]).filter((l) => l.url && allowedUrls.has(l.url))
      : [];

    const suggestion = await this.prisma.productSeoSuggestion.create({
      data: {
        productId,
        metaTitle: typeof parsed.metaTitle === 'string' ? parsed.metaTitle : undefined,
        metaDescription: typeof parsed.metaDescription === 'string' ? parsed.metaDescription : undefined,
        searchKeywords: typeof parsed.searchKeywords === 'string' ? parsed.searchKeywords : undefined,
        h1Suggestion: typeof parsed.h1Suggestion === 'string' ? parsed.h1Suggestion : undefined,
        descriptionSuggestion: typeof parsed.descriptionSuggestion === 'string' ? parsed.descriptionSuggestion : undefined,
        faq: (parsed.faq as any) ?? undefined,
        altTextSuggestions: altTextSuggestions as any,
        internalLinks: internalLinks as any,
        sources: ['دانش عمومی هوش مصنوعی — بدون جستجوی زنده اینترنتی؛ نیازمند بررسی انسانی قبل از اعمال'] as any,
        confidenceNote: typeof parsed.confidenceNote === 'string' ? parsed.confidenceNote : undefined,
        createdByUserId: userId,
      },
    });

    await this.auditLog.record({ userId, action: 'seo.suggestion_generated', entityType: 'ProductSeoSuggestion', entityId: suggestion.id, after: suggestion });

    if ((await this.settings.resolve('seoAutoFixEnabled')) === 'true') {
      await this.applyLowRiskAutoFix(suggestion, product.images.map((i) => i.id));
    }

    return suggestion;
  }

  async update(id: string, dto: UpdateSeoSuggestionDto, userId?: string) {
    const before = await this.getSuggestion(id);
    if (before.status !== 'PENDING_REVIEW') {
      throw new BadRequestException('فقط پیشنهادهای در انتظار بررسی قابل ویرایش هستند');
    }
    const suggestion = await this.prisma.productSeoSuggestion.update({ where: { id }, data: dto as any });
    await this.auditLog.record({ userId, action: 'seo.suggestion_edited', entityType: 'ProductSeoSuggestion', entityId: id, before, after: suggestion });
    return suggestion;
  }

  async reject(id: string, reason: string | undefined, userId?: string) {
    const before = await this.getSuggestion(id);
    if (before.status !== 'PENDING_REVIEW') {
      throw new BadRequestException('فقط پیشنهادهای در انتظار بررسی قابل رد هستند');
    }
    const suggestion = await this.prisma.productSeoSuggestion.update({
      where: { id },
      data: { status: 'REJECTED', rejectionReason: reason, reviewedByUserId: userId, reviewedAt: new Date() },
    });
    await this.auditLog.record({ userId, action: 'seo.suggestion_rejected', entityType: 'ProductSeoSuggestion', entityId: id, before, after: suggestion });
    return suggestion;
  }

  // The only path that ever changes a live Product's SEO fields via this
  // pipeline — always an explicit, authenticated staff action. h1Suggestion
  // is never applied to Product.name here (see NEVER_AUTO_FIX_FIELDS note).
  async approve(id: string, userId?: string) {
    const before = await this.getSuggestion(id);
    if (before.status !== 'PENDING_REVIEW') {
      throw new BadRequestException('فقط پیشنهادهای در انتظار بررسی قابل تأیید هستند');
    }

    const appliedFields = await this.applyToProduct(before, before.productId);

    const suggestion = await this.prisma.productSeoSuggestion.update({
      where: { id },
      data: { status: 'APPROVED', appliedFields: appliedFields as any, reviewedByUserId: userId, reviewedAt: new Date() },
    });

    await this.auditLog.record({ userId, action: 'seo.suggestion_approved', entityType: 'Product', entityId: before.productId, before, after: { appliedFields } });
    return suggestion;
  }

  private async applyToProduct(suggestion: { productId: string; metaTitle: string | null; metaDescription: string | null; searchKeywords: string | null; descriptionSuggestion: string | null; altTextSuggestions: unknown }, productId: string): Promise<string[]> {
    const applied: string[] = [];
    const productData: Record<string, unknown> = {};

    if (suggestion.metaTitle) {
      productData.metaTitle = suggestion.metaTitle;
      applied.push('metaTitle');
    }
    if (suggestion.metaDescription) {
      productData.metaDescription = suggestion.metaDescription;
      applied.push('metaDescription');
    }
    if (suggestion.searchKeywords) {
      productData.searchKeywords = suggestion.searchKeywords;
      applied.push('searchKeywords');
    }
    if (suggestion.descriptionSuggestion) {
      productData.description = suggestion.descriptionSuggestion;
      applied.push('description');
    }

    if (Object.keys(productData).length > 0) {
      await this.prisma.product.update({ where: { id: productId }, data: productData });
    }

    const altText = (suggestion.altTextSuggestions as Record<string, string>) ?? {};
    for (const [imageId, text] of Object.entries(altText)) {
      await this.prisma.productImage.update({ where: { id: imageId }, data: { altText: text } }).catch(() => undefined);
      applied.push(`images.${imageId}.altText`);
    }

    return applied;
  }

  // Auto-applies only the pre-defined low-risk fields, immediately after
  // generation, when the admin has explicitly opted into
  // AppSettings.seoAutoFixEnabled. metaTitle/h1/description are never
  // touched here regardless of that setting.
  private async applyLowRiskAutoFix(
    suggestion: { id: string; productId: string; metaDescription: string | null; searchKeywords: string | null; altTextSuggestions: unknown },
    validImageIds: string[],
  ): Promise<void> {
    const productData: Record<string, unknown> = {};
    const applied: string[] = [];

    if (suggestion.metaDescription) {
      productData.metaDescription = suggestion.metaDescription;
      applied.push('metaDescription');
    }
    if (suggestion.searchKeywords) {
      productData.searchKeywords = suggestion.searchKeywords;
      applied.push('searchKeywords');
    }
    if (Object.keys(productData).length > 0) {
      await this.prisma.product.update({ where: { id: suggestion.productId }, data: productData });
    }

    const altText = (suggestion.altTextSuggestions as Record<string, string>) ?? {};
    for (const [imageId, text] of Object.entries(altText)) {
      if (!validImageIds.includes(imageId)) continue;
      await this.prisma.productImage.update({ where: { id: imageId }, data: { altText: text } }).catch(() => undefined);
      applied.push(`images.${imageId}.altText`);
    }

    if (applied.length === 0) return;

    await this.prisma.productSeoSuggestion.update({
      where: { id: suggestion.id },
      data: { status: 'APPROVED', appliedFields: applied as any, reviewedAt: new Date() },
    });
    await this.auditLog.record({
      action: 'seo.auto_fix_applied',
      entityType: 'Product',
      entityId: suggestion.productId,
      after: { appliedFields: applied },
    });
  }

  // Real internal-link candidates only: other products in the same
  // category, plus published blog posts — a small, honest allow-list the
  // model must choose from, never invent from.
  private async buildAllowedLinks(productId: string, categoryId: string | null): Promise<{ label: string; url: string }[]> {
    const [relatedProducts, blogPosts] = await Promise.all([
      categoryId
        ? this.prisma.product.findMany({ where: { categoryId, status: 'PUBLISHED', id: { not: productId } }, select: { name: true, slug: true }, take: 5 })
        : Promise.resolve([]),
      this.prisma.blogPost.findMany({ where: { isPublished: true }, select: { title: true, slug: true }, take: 5 }),
    ]);

    return [
      ...relatedProducts.map((p) => ({ label: p.name, url: `/products/${p.slug}` })),
      ...blogPosts.map((b) => ({ label: b.title, url: `/blog/${b.slug}` })),
    ];
  }
}
