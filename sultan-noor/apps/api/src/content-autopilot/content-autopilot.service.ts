import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ContentDraftType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { AuditLogService } from '../audit/audit-log.service';
import { AiUsageService } from '../ai-usage/ai-usage.service';
import { BlogService } from '../blog/blog.service';
import { ProductsService, slugify } from '../catalog/products/products.service';
import { extractJsonFromModelText } from '../common/utils/extract-json.util';
import { ApproveContentDraftDto, GenerateContentDraftDto, UpdateContentDraftDto } from './dto/content-draft.dto';

const APPROXIMATE_COST_TOMAN = 400;

const BLOG_LIKE_TYPES: ContentDraftType[] = ['BLOG_POST', 'BUYING_GUIDE', 'COMPARISON', 'FAQ', 'EDUCATIONAL_ARTICLE'];

// The model has no live web access here (a plain Messages API call), so
// everything it writes must come from either its own general knowledge
// (disclosed as such in `sources`) or the real store data handed to it in
// this prompt — never presented as fact it verified live.
const CONTENT_SYSTEM_PROMPT = `شما برای فروشگاه اینترنتی «سلطان نور» (لوازم روشنایی و برقی) محتوای سایت تولید می‌کنید.

قوانین مهم:
- متن باید فارسی، طبیعی و روان باشد — نه ترجمه‌ی ماشینی و نه کپی از جای دیگر.
- هرگز یک قیمت، مشخصه‌ی فنی یا آماری که در «اطلاعات واقعی» داده‌شده در ادامه نیامده را نسازید یا حدس نزنید.
- اگر چیزی را از دانش عمومی خودتان می‌نویسید (نه از داده‌ی واقعی فروشگاه)، همین را صادقانه در فیلد sources ذکر کنید.
- internalLinks را فقط از فهرست «لینک‌های مجاز» زیر انتخاب کنید — هرگز آدرس جدیدی نسازید.
- خروجی باید فقط یک JSON معتبر با این ساختار باشد، بدون هیچ متن اضافه یا Markdown:
{
  "title": "عنوان",
  "excerpt": "خلاصه‌ی کوتاه",
  "body": "متن کامل مقاله با پاراگراف‌بندی مناسب (می‌توانید از ## برای زیرعنوان‌ها استفاده کنید)",
  "faq": [{ "q": "سوال", "a": "پاسخ" }],
  "metaTitle": "عنوان سئو زیر ۶۰ کاراکتر",
  "metaDescription": "توضیح متا بین ۵۰ تا ۱۶۰ کاراکتر",
  "suggestedImagePrompt": "توصیف کوتاه یک تصویر مناسب برای این محتوا",
  "internalLinks": [{ "label": "متن لینک", "url": "دقیقاً یکی از لینک‌های مجاز" }],
  "sources": ["توضیح این‌که اطلاعات از کجا آمده — داده‌ی واقعی فروشگاه یا دانش عمومی"]
}`;

@Injectable()
export class ContentAutopilotService {
  private readonly logger = new Logger(ContentAutopilotService.name);

  constructor(
    private prisma: PrismaService,
    private settings: SettingsService,
    private auditLog: AuditLogService,
    private aiUsage: AiUsageService,
    private blog: BlogService,
    private products: ProductsService,
  ) {}

  list(status?: string) {
    return this.prisma.contentDraft.findMany({
      where: status ? { status: status as any } : undefined,
      orderBy: { createdAt: 'desc' },
    });
  }

  async getDraft(id: string) {
    const draft = await this.prisma.contentDraft.findUnique({ where: { id } });
    if (!draft) throw new NotFoundException('پیش‌نویس محتوا یافت نشد');
    return draft;
  }

  async generate(dto: GenerateContentDraftDto, userId?: string) {
    if (dto.type === 'PRODUCT_INTRO' && !dto.productId) {
      throw new BadRequestException('برای «معرفی محصول» باید محصول مشخص شود');
    }
    if (dto.type === 'CATEGORY_CONTENT' && !dto.categoryId) {
      throw new BadRequestException('برای «محتوای دسته‌بندی» باید دسته‌بندی مشخص شود');
    }

    const apiKey = await this.settings.resolve('anthropicApiKey');
    if (!apiKey) throw new BadRequestException('برای این قابلیت باید کلید API هوش مصنوعی در بخش تنظیمات وارد شود.');

    if (!(await this.aiUsage.checkBudget())) {
      throw new BadRequestException('بودجه ماهانه سئو/محتوا برای این ماه به پایان رسیده است.');
    }

    const groundingInfo = await this.buildGroundingInfo(dto);
    const allowedLinks = await this.buildAllowedLinks(dto);

    let parsed: Record<string, unknown>;
    try {
      const model = (await this.settings.resolve('anthropicModel')) ?? 'claude-sonnet-4-5';
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model,
          max_tokens: 2500,
          system: CONTENT_SYSTEM_PROMPT,
          messages: [
            {
              role: 'user',
              content: [
                `نوع محتوا: ${dto.type}`,
                `موضوع: ${dto.topic}`,
                dto.keywords ? `کلمات کلیدی: ${dto.keywords}` : '',
                groundingInfo,
                `لینک‌های مجاز برای internalLinks:\n${JSON.stringify(allowedLinks)}`,
              ]
                .filter(Boolean)
                .join('\n\n'),
            },
          ],
        }),
      });
      const data = await res.json();
      const text = data.content?.[0]?.text;
      if (!text) throw new Error('پاسخ خالی از دستیار هوشمند');
      parsed = JSON.parse(extractJsonFromModelText(text));
    } catch (err) {
      await this.aiUsage.record('content-generation', dto.productId ?? dto.categoryId, false, APPROXIMATE_COST_TOMAN);
      this.logger.error('Content generation failed', err as Error);
      throw new BadRequestException('تولید محتوا ناموفق بود. لطفاً دوباره تلاش کنید.');
    }
    await this.aiUsage.record('content-generation', dto.productId ?? dto.categoryId, true, APPROXIMATE_COST_TOMAN);

    const allowedUrls = new Set(allowedLinks.map((l) => l.url));
    const internalLinks = Array.isArray(parsed.internalLinks)
      ? (parsed.internalLinks as { label?: string; url?: string }[]).filter((l) => l.url && allowedUrls.has(l.url))
      : [];

    const draft = await this.prisma.contentDraft.create({
      data: {
        type: dto.type,
        topic: dto.topic,
        keywords: dto.keywords,
        productId: dto.productId,
        categoryId: dto.categoryId,
        title: typeof parsed.title === 'string' ? parsed.title : undefined,
        excerpt: typeof parsed.excerpt === 'string' ? parsed.excerpt : undefined,
        body: typeof parsed.body === 'string' ? parsed.body : undefined,
        faq: (parsed.faq as any) ?? undefined,
        metaTitle: typeof parsed.metaTitle === 'string' ? parsed.metaTitle : undefined,
        metaDescription: typeof parsed.metaDescription === 'string' ? parsed.metaDescription : undefined,
        suggestedImagePrompt: typeof parsed.suggestedImagePrompt === 'string' ? parsed.suggestedImagePrompt : undefined,
        internalLinks: internalLinks as any,
        sources: Array.isArray(parsed.sources) ? (parsed.sources as any) : (['دانش عمومی هوش مصنوعی — بدون جستجوی زنده اینترنتی'] as any),
        createdByUserId: userId,
      },
    });

    await this.auditLog.record({ userId, action: 'content.generated', entityType: 'ContentDraft', entityId: draft.id, after: draft });
    return draft;
  }

  async update(id: string, dto: UpdateContentDraftDto, userId?: string) {
    const before = await this.getDraft(id);
    if (before.status !== 'PENDING_REVIEW') {
      throw new BadRequestException('فقط پیش‌نویس‌های در انتظار بررسی قابل ویرایش هستند');
    }
    const draft = await this.prisma.contentDraft.update({ where: { id }, data: dto as any });
    await this.auditLog.record({ userId, action: 'content.edited', entityType: 'ContentDraft', entityId: id, before, after: draft });
    return draft;
  }

  async reject(id: string, reason: string | undefined, userId?: string) {
    const before = await this.getDraft(id);
    if (before.status !== 'PENDING_REVIEW') {
      throw new BadRequestException('فقط پیش‌نویس‌های در انتظار بررسی قابل رد هستند');
    }
    const draft = await this.prisma.contentDraft.update({
      where: { id },
      data: { status: 'REJECTED', rejectionReason: reason, reviewedByUserId: userId, reviewedAt: new Date() },
    });
    await this.auditLog.record({ userId, action: 'content.rejected', entityType: 'ContentDraft', entityId: id, before, after: draft });
    return draft;
  }

  // "تأیید و انتشار" when dto.publish is true (immediately reuses the
  // existing BlogPost/Product/Category systems — no second publishing
  // path); "ذخیره به‌عنوان پیش‌نویس" when false — marks APPROVED without
  // touching anything public. publish() below promotes an APPROVED draft
  // to PUBLISHED later.
  async approve(id: string, dto: ApproveContentDraftDto, userId?: string) {
    const before = await this.getDraft(id);
    if (before.status !== 'PENDING_REVIEW') {
      throw new BadRequestException('فقط پیش‌نویس‌های در انتظار بررسی قابل تأیید هستند');
    }

    // `publish` is a DTO-only flag, not a ContentDraft column — it must
    // never reach Prisma's update `data`.
    const { publish, ...fields } = dto;
    const merged = { ...before, ...fields };

    if (!publish) {
      const draft = await this.prisma.contentDraft.update({
        where: { id },
        data: { ...(fields as any), status: 'APPROVED', reviewedByUserId: userId, reviewedAt: new Date() },
      });
      await this.auditLog.record({ userId, action: 'content.approved_as_draft', entityType: 'ContentDraft', entityId: id, before });
      return draft;
    }

    const publishResult = await this.performPublish(merged, userId);
    const draft = await this.prisma.contentDraft.update({
      where: { id },
      data: { ...(fields as any), status: 'PUBLISHED', publishedBlogPostId: publishResult.blogPostId, reviewedByUserId: userId, reviewedAt: new Date() },
    });
    await this.auditLog.record({ userId, action: 'content.published', entityType: 'ContentDraft', entityId: id, before, after: publishResult });
    return draft;
  }

  // Promotes a previously "ذخیره به‌عنوان پیش‌نویس" (APPROVED, not yet
  // public) draft to actually publish now.
  async publish(id: string, userId?: string) {
    const before = await this.getDraft(id);
    if (before.status !== 'APPROVED') {
      throw new BadRequestException('فقط پیش‌نویس‌های تأییدشده قابل انتشار هستند');
    }
    const publishResult = await this.performPublish(before, userId);
    const draft = await this.prisma.contentDraft.update({
      where: { id },
      data: { status: 'PUBLISHED', publishedBlogPostId: publishResult.blogPostId, reviewedByUserId: userId, reviewedAt: new Date() },
    });
    await this.auditLog.record({ userId, action: 'content.published', entityType: 'ContentDraft', entityId: id, before, after: publishResult });
    return draft;
  }

  private async performPublish(
    content: { type: ContentDraftType; title: string | null; excerpt: string | null; body: string | null; metaTitle: string | null; metaDescription: string | null; productId: string | null; categoryId: string | null },
    userId?: string,
  ): Promise<{ blogPostId?: string }> {
    if (BLOG_LIKE_TYPES.includes(content.type)) {
      if (!content.title || !content.body) throw new BadRequestException('عنوان و متن محتوا برای انتشار الزامی است');
      const post = await this.blog.create(userId ?? '', {
        title: content.title,
        slug: slugify(content.title),
        excerpt: content.excerpt ?? undefined,
        content: content.body,
        metaTitle: content.metaTitle ?? undefined,
        metaDescription: content.metaDescription ?? undefined,
      } as any);
      await this.blog.update(post.id, { isPublished: true });
      return { blogPostId: post.id };
    }

    if (content.type === 'PRODUCT_INTRO') {
      if (!content.productId) throw new BadRequestException('محصول مقصد برای این محتوا مشخص نیست');
      if (content.body) await this.prisma.product.update({ where: { id: content.productId }, data: { description: content.body } });
      return {};
    }

    if (content.type === 'CATEGORY_CONTENT') {
      if (!content.categoryId) throw new BadRequestException('دسته‌بندی مقصد برای این محتوا مشخص نیست');
      if (content.body) await this.prisma.category.update({ where: { id: content.categoryId }, data: { description: content.body } });
      return {};
    }

    return {};
  }

  private async buildGroundingInfo(dto: GenerateContentDraftDto): Promise<string> {
    const parts: string[] = [];

    if (dto.productId) {
      const product = await this.prisma.product.findUnique({
        where: { id: dto.productId },
        select: { name: true, description: true, basePrice: true, brand: { select: { name: true } }, category: { select: { name: true } } },
      });
      if (product) {
        parts.push(
          `اطلاعات واقعی محصول مرتبط:\nنام: ${product.name}\nبرند: ${product.brand?.name ?? 'ثبت نشده'}\nدسته‌بندی: ${product.category?.name ?? 'ثبت نشده'}\nقیمت: ${Number(product.basePrice).toLocaleString('fa-IR')} تومان\nتوضیحات: ${product.description ?? 'ثبت نشده'}`,
        );
      }
    }

    if (dto.categoryId) {
      const category = await this.prisma.category.findUnique({ where: { id: dto.categoryId }, select: { name: true } });
      const products = await this.prisma.product.findMany({ where: { categoryId: dto.categoryId, status: 'PUBLISHED' }, select: { name: true }, take: 10 });
      if (category) {
        parts.push(`اطلاعات واقعی دسته‌بندی:\nنام دسته: ${category.name}\nمحصولات واقعی این دسته: ${products.map((p) => p.name).join('، ') || 'هیچ‌کدام'}`);
      }
    }

    return parts.join('\n\n');
  }

  // Real internal-link candidates only: same-category products, real
  // co-purchase "complementary products" (reuses the existing, non-AI
  // frequentlyBoughtWith algorithm), and published blog posts — a small,
  // honest allow-list the model must choose from, never invent from.
  private async buildAllowedLinks(dto: GenerateContentDraftDto): Promise<{ label: string; url: string }[]> {
    const links: { label: string; url: string }[] = [];

    if (dto.categoryId) {
      const products = await this.prisma.product.findMany({ where: { categoryId: dto.categoryId, status: 'PUBLISHED' }, select: { name: true, slug: true }, take: 8 });
      links.push(...products.map((p) => ({ label: p.name, url: `/products/${p.slug}` })));
    }

    if (dto.productId) {
      const complementary = await this.products.frequentlyBoughtWith(dto.productId, 5);
      for (const p of complementary as { name: string; slug: string }[]) {
        links.push({ label: p.name, url: `/products/${p.slug}` });
      }
    }

    const blogPosts = await this.prisma.blogPost.findMany({ where: { isPublished: true }, select: { title: true, slug: true }, take: 5 });
    links.push(...blogPosts.map((b) => ({ label: b.title, url: `/blog/${b.slug}` })));

    // De-duplicate by URL.
    const seen = new Set<string>();
    return links.filter((l) => (seen.has(l.url) ? false : (seen.add(l.url), true)));
  }
}
