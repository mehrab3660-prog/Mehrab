import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { ProductsService, slugify } from '../catalog/products/products.service';
import { AuditLogService } from '../audit/audit-log.service';
import { AiImageAutopilotService } from '../ai-image/ai-image-autopilot.service';
import { ApproveProductDraftDto, PrepareProductDraftDto, ProductDraftFieldsDto } from './dto/ai-product.dto';

// The model must never invent a spec it isn't confident about — it must say
// so in confidenceNote instead — and it has no live web access here (a plain
// Messages API call, no browsing tool), so specs come from its own training
// knowledge only. That limitation is surfaced to the reviewing admin, never
// hidden, matching how every other AI feature in this app is grounded.
const PRODUCT_DRAFT_SYSTEM_PROMPT = `شما به یک فروشگاه اینترنتی لوازم روشنایی و برقی («سلطان نور») کمک می‌کنید تا برای یک محصول
جدید، پیش‌نویس اطلاعات تهیه کنید. مدیر فروشگاه فقط نام، برند/مدل و قیمت را وارد کرده و بقیه‌ی اطلاعات را از شما می‌خواهد.

قوانین مهم:
- شما به اینترنت زنده دسترسی ندارید؛ فقط از دانش عمومی خود درباره‌ی این نوع محصول استفاده کنید.
- هرگز عددی مثل ولتاژ، توان یا قیمت را حدس نزنید مگر واقعاً از آن مطمئن باشید. اگر مطمئن نیستید، آن مقدار را ننویسید
  و در فیلد confidenceNote صادقانه توضیح دهید که مدیر باید چه مواردی را پیش از انتشار عمومی بررسی کند.
- suggestedPrice فقط یک تخمین کلی بازار است، نه یک قیمت قطعی — مدیر خودش قیمت نهایی را تعیین می‌کند.
- خروجی باید فقط یک JSON معتبر با ساختار زیر باشد، بدون هیچ متن اضافه یا Markdown:
{
  "description": "توضیح فروش حرفه‌ای و فارسی، ۲ تا ۴ پاراگراف کوتاه",
  "specs": { "نام مشخصه": "مقدار" },
  "features": ["ویژگی کوتاه", "..."],
  "faq": [{ "q": "سوال احتمالی مشتری", "a": "پاسخ" }],
  "seoTitle": "عنوان سئو زیر ۶۰ کاراکتر",
  "seoDescription": "توضیح متا زیر ۱۶۰ کاراکتر",
  "categoryName": "نزدیک‌ترین دسته‌بندی مناسب",
  "suggestedPrice": عدد یا null,
  "confidenceNote": "هرچه نامطمئن است یا نیاز به بررسی مدیر دارد"
}`;

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1];
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) return text.slice(start, end + 1);
  return text;
}

// Folds the structured draft into the single free-text description field
// that Product actually has today — Product has no dedicated specs/features/
// FAQ columns yet, so this is the honest way to carry that content onto a
// live product without a larger schema change outside this Sprint's scope.
function composeDescription(description?: string | null, specs?: unknown, features?: unknown, faq?: unknown): string | undefined {
  const parts: string[] = [];
  if (description) parts.push(description);

  if (specs && typeof specs === 'object' && Object.keys(specs as object).length > 0) {
    const lines = Object.entries(specs as Record<string, unknown>).map(([k, v]) => `- ${k}: ${v}`);
    parts.push(['مشخصات فنی:', ...lines].join('\n'));
  }

  if (Array.isArray(features) && features.length > 0) {
    parts.push(['ویژگی‌ها:', ...features.map((f) => `- ${f}`)].join('\n'));
  }

  if (Array.isArray(faq) && faq.length > 0) {
    const lines = (faq as { q?: string; a?: string }[])
      .filter((f) => f.q && f.a)
      .map((f) => `س: ${f.q}\nج: ${f.a}`);
    if (lines.length > 0) parts.push(['پرسش‌های متداول:', ...lines].join('\n\n'));
  }

  return parts.length > 0 ? parts.join('\n\n') : undefined;
}

@Injectable()
export class AiProductService {
  private readonly logger = new Logger(AiProductService.name);

  constructor(
    private prisma: PrismaService,
    private settings: SettingsService,
    private products: ProductsService,
    private auditLog: AuditLogService,
    private aiImage: AiImageAutopilotService,
  ) {}

  listDrafts(status?: string) {
    return this.prisma.productAiDraft.findMany({
      where: status ? { status: status as any } : undefined,
      orderBy: { createdAt: 'desc' },
    });
  }

  async getDraft(id: string) {
    const draft = await this.prisma.productAiDraft.findUnique({
      where: { id },
      include: { images: { orderBy: [{ isMain: 'desc' }, { createdAt: 'asc' }] } },
    });
    if (!draft) throw new NotFoundException('پیش‌نویس یافت نشد');
    return draft;
  }

  async prepare(dto: PrepareProductDraftDto, userId?: string, baseUrl?: string) {
    const apiKey = await this.settings.resolve('anthropicApiKey');
    if (!apiKey) {
      throw new BadRequestException('برای این قابلیت باید کلید API هوش مصنوعی در بخش تنظیمات وارد شود.');
    }

    const [brands, categories] = await Promise.all([
      this.prisma.brand.findMany({ select: { name: true } }),
      this.prisma.category.findMany({ select: { name: true } }),
    ]);

    let parsed: Record<string, unknown>;
    try {
      const model = (await this.settings.resolve('anthropicModel')) ?? 'claude-sonnet-4-5';
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model,
          max_tokens: 1500,
          system: PRODUCT_DRAFT_SYSTEM_PROMPT,
          messages: [
            {
              role: 'user',
              content: [
                `نام محصول: ${dto.name}`,
                dto.brandName ? `برند/مدل: ${dto.brandName}${dto.modelNumber ? ' ' + dto.modelNumber : ''}` : '',
                `قیمت وارد شده توسط مدیر: ${dto.ownerPrice}`,
                `دسته‌بندی‌های موجود در فروشگاه: ${categories.map((c) => c.name).join('، ') || 'هیچ‌کدام'}`,
                `برندهای موجود در فروشگاه: ${brands.map((b) => b.name).join('، ') || 'هیچ‌کدام'}`,
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
      parsed = JSON.parse(extractJson(text));
    } catch (err) {
      this.logger.error('AI product draft preparation failed', err as Error);
      throw new BadRequestException('آماده‌سازی محصول با هوش مصنوعی ناموفق بود. لطفاً دوباره تلاش کنید.');
    }

    const draft = await this.prisma.productAiDraft.create({
      data: {
        name: dto.name,
        brandName: dto.brandName,
        modelNumber: dto.modelNumber,
        ownerPrice: dto.ownerPrice,
        suggestedPrice: typeof parsed.suggestedPrice === 'number' ? parsed.suggestedPrice : undefined,
        description: typeof parsed.description === 'string' ? parsed.description : undefined,
        specs: (parsed.specs as any) ?? undefined,
        features: (parsed.features as any) ?? undefined,
        faq: (parsed.faq as any) ?? undefined,
        seoTitle: typeof parsed.seoTitle === 'string' ? parsed.seoTitle : undefined,
        seoDescription: typeof parsed.seoDescription === 'string' ? parsed.seoDescription : undefined,
        categoryName: typeof parsed.categoryName === 'string' ? parsed.categoryName : undefined,
        confidenceNote: typeof parsed.confidenceNote === 'string' ? parsed.confidenceNote : undefined,
        sources: ['دانش عمومی هوش مصنوعی — بدون جستجوی زنده اینترنتی؛ نیازمند بررسی انسانی قبل از انتشار'] as any,
        createdByUserId: userId,
      },
    });

    await this.auditLog.record({ userId, action: 'ai_product.prepare', entityType: 'ProductAiDraft', entityId: draft.id, after: draft });

    // Image Autopilot (Sprint 2) — best-effort, never throws, never blocks
    // the text draft that was just created above. On any failure it leaves
    // draft.imageAutopilotNote set instead, and staff can upload manually.
    if (baseUrl) {
      await this.aiImage.runForDraft(draft.id, baseUrl);
      return this.getDraft(draft.id);
    }
    return { ...draft, images: [] };
  }

  async update(id: string, dto: ProductDraftFieldsDto, userId?: string) {
    const before = await this.getDraft(id);
    if (before.status !== 'PENDING_REVIEW') {
      throw new BadRequestException('فقط پیش‌نویس‌های در انتظار بررسی قابل ویرایش هستند');
    }
    const draft = await this.prisma.productAiDraft.update({
      where: { id },
      data: dto as any,
    });
    await this.auditLog.record({ userId, action: 'ai_product.edit', entityType: 'ProductAiDraft', entityId: id, before, after: draft });
    return draft;
  }

  async reject(id: string, reason: string | undefined, userId?: string) {
    const before = await this.getDraft(id);
    if (before.status !== 'PENDING_REVIEW') {
      throw new BadRequestException('فقط پیش‌نویس‌های در انتظار بررسی قابل رد هستند');
    }
    const draft = await this.prisma.productAiDraft.update({
      where: { id },
      data: { status: 'REJECTED', rejectionReason: reason, reviewedByUserId: userId, reviewedAt: new Date() },
    });
    await this.auditLog.record({ userId, action: 'ai_product.reject', entityType: 'ProductAiDraft', entityId: id, before, after: draft });
    return draft;
  }

  // The only path in this whole feature that ever creates or changes a real,
  // publicly-visible Product — always an explicit, authenticated staff
  // action, never automatic.
  async approve(id: string, dto: ApproveProductDraftDto, userId?: string) {
    const before = await this.getDraft(id);
    if (before.status !== 'PENDING_REVIEW') {
      throw new BadRequestException('فقط پیش‌نویس‌های در انتظار بررسی قابل تأیید هستند');
    }

    const categoryName = dto.categoryName ?? before.categoryName ?? undefined;
    let categoryId: string | undefined;
    if (categoryName) {
      const existing = await this.prisma.category.findFirst({ where: { name: categoryName } });
      categoryId = existing ? existing.id : (await this.prisma.category.create({ data: { name: categoryName, slug: slugify(categoryName) } })).id;
    }

    const brandName = dto.brandName ?? before.brandName ?? undefined;
    let brandId: string | undefined;
    if (brandName) {
      const existing = await this.prisma.brand.findFirst({ where: { name: brandName } });
      brandId = existing ? existing.id : (await this.prisma.brand.create({ data: { name: brandName, slug: slugify(brandName) } })).id;
    }

    const name = dto.name ?? before.name;
    const description = composeDescription(
      dto.description ?? before.description,
      dto.specs ?? before.specs,
      dto.features ?? before.features,
      dto.faq ?? before.faq,
    );

    // Every non-rejected draft image becomes part of the published product —
    // an explicitly REJECTED image can never end up here (see
    // AiImageAutopilotService.rejectImage). Main-first ordering matches
    // ProductsService.create()'s imageUrls[0] = position 0 = primary image
    // convention, so no second publishing path is needed for images either.
    const draftImages = await this.prisma.productAiDraftImage.findMany({
      where: { draftId: id, status: { not: 'REJECTED' } },
      orderBy: [{ isMain: 'desc' }, { createdAt: 'asc' }],
    });
    const imageUrls = draftImages.map((img) => img.url).filter((url): url is string => !!url);

    const product = await this.products.create({
      name,
      slug: slugify(name),
      description,
      status: dto.publish ? 'PUBLISHED' : 'DRAFT',
      brandId,
      categoryId,
      basePrice: Number(before.ownerPrice),
      metaTitle: dto.seoTitle ?? before.seoTitle ?? undefined,
      metaDescription: dto.seoDescription ?? before.seoDescription ?? undefined,
      imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
      variants: [
        {
          // Deterministic from the draft id so re-approving the same draft
          // (after a failed attempt) can't silently collide with another
          // product's SKU.
          sku: `AI-${before.id.slice(-10).toUpperCase()}`,
          attributes: {},
          price: Number(before.ownerPrice),
        },
      ],
    });

    if (draftImages.length > 0) {
      await this.prisma.productAiDraftImage.updateMany({
        where: { id: { in: draftImages.map((img) => img.id) } },
        data: { status: 'APPROVED' },
      });
      await this.auditLog.record({
        userId,
        action: 'ai_image.published',
        entityType: 'Product',
        entityId: product.id,
        after: { imageCount: draftImages.length },
      });
    }

    const draft = await this.prisma.productAiDraft.update({
      where: { id },
      data: { status: 'APPROVED', publishedProductId: product.id, reviewedByUserId: userId, reviewedAt: new Date() },
    });

    await this.auditLog.record({
      userId,
      action: 'ai_product.approve',
      entityType: 'ProductAiDraft',
      entityId: id,
      before,
      after: { status: draft.status, productId: product.id, published: !!dto.publish },
    });

    return { draft, product };
  }
}
