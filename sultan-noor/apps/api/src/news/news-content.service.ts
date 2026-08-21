import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { AuditLogService } from '../audit/audit-log.service';
import { NewsAiUsageService } from '../ai-usage/news-ai-usage.service';
import { NewsImageService } from './news-image.service';
import { BlogService } from '../blog/blog.service';
import { slugify } from '../catalog/products/products.service';
import { extractJsonFromModelText } from '../common/utils/extract-json.util';
import { UpdateNewsItemDto } from './dto/news.dto';

const APPROXIMATE_COST_TOMAN = 300;

const NEWS_SYSTEM_PROMPT = `شما ویراستار محتوای فروشگاه اینترنتی «سلطان نور» (لوازم روشنایی، برق ساختمان و هوشمندسازی) هستید.
یک خبر واقعی که در ادامه آمده را به محتوای اختصاصی و روان فارسی برای سایت سلطان نور تبدیل کنید.

قوانین مهم و غیرقابل‌مذاکره:
- هرگز چیزی را که در متن منبع نیامده اضافه یا حدس نزنید — هیچ آمار، نقل‌قول، تاریخ یا ادعای جدیدی نسازید.
- این کار بازنویسی اختصاصی است، نه ترجمه‌ی کلمه‌به‌کلمه و نه کپی مستقیم از منبع.
- نام برند، مدل محصول، استاندارد فنی و اصطلاحات تخصصی دقیقاً همانطور که در منبع آمده حفظ شوند.
- اگر بخشی از خبر نامطمئن یا مبهم است، آن را در confidenceNote مشخص کنید — حدس نزنید.
- فیلد confirmingSources را فقط اگر منبع دیگری واقعاً در ورودی داده شده پر کنید؛ در غیر این صورت آرایه‌ی خالی برگردانید — هرگز منبع تأییدکننده‌ی جعلی نسازید.
- خروجی باید فقط یک JSON معتبر با این ساختار باشد، بدون هیچ متن اضافه یا Markdown:
{
  "title": "عنوان خبر به فارسی",
  "excerpt": "خلاصه‌ی کوتاه",
  "body": "متن کامل خبر با پاراگراف‌بندی مناسب",
  "category": "یکی از: برق ساختمان، برق صنعتی، هوشمندسازی ساختمان، خانه هوشمند، BMS، روشنایی، تجهیزات برق، کلید و پریز، سیم و کابل، انرژی خورشیدی، ذخیره انرژی، UPS، خودرو برقی و شارژر، IoT، ایمنی برق، استانداردها، عمومی",
  "tags": "چند برچسب با کاما جدا شده",
  "seoTitle": "عنوان سئو زیر ۶۰ کاراکتر",
  "metaDescription": "توضیح متا بین ۵۰ تا ۱۶۰ کاراکتر",
  "keywords": "چند کلمه کلیدی با کاما جدا شده",
  "faq": [{ "q": "سوال", "a": "پاسخ" }],
  "confirmingSources": [],
  "suggestedImagePrompt": "توصیف کوتاه یک تصویر مناسب برای این خبر",
  "confidenceNote": "هرچه نامطمئن است یا نیاز به بررسی مدیر دارد، یا رشته‌ی خالی"
}`;

@Injectable()
export class NewsContentService {
  private readonly logger = new Logger(NewsContentService.name);

  constructor(
    private prisma: PrismaService,
    private settings: SettingsService,
    private auditLog: AuditLogService,
    private aiUsage: NewsAiUsageService,
    private newsImage: NewsImageService,
    private blog: BlogService,
  ) {}

  list(status?: string) {
    return this.prisma.newsItem.findMany({
      where: status ? { status: status as any } : undefined,
      orderBy: { discoveredAt: 'desc' },
    });
  }

  async getById(id: string) {
    const item = await this.prisma.newsItem.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('خبر یافت نشد');
    return item;
  }

  // VERIFIED -> AI_DRAFT (translated/rewritten, never copied) -> PENDING_REVIEW,
  // plus an image resolved through the same priority pipeline the spec asks
  // for. Grounded strictly in this one real NewsItem's own captured fields —
  // the model gets nothing else to draw from.
  async generateDraft(id: string, userId?: string, baseUrl = '') {
    const apiKey = await this.settings.resolve('anthropicApiKey');
    if (!apiKey) throw new BadRequestException('برای این قابلیت باید کلید API هوش مصنوعی در بخش تنظیمات وارد شود.');

    const item = await this.getById(id);
    if (item.status !== 'VERIFIED') throw new BadRequestException('فقط اخبار تأییدشده (VERIFIED) قابل تبدیل به پیش‌نویس هستند');

    if (!(await this.aiUsage.checkBudget())) throw new BadRequestException('بودجه ماهانه هوش مصنوعی اخبار برای این ماه به پایان رسیده است.');

    let parsed: Record<string, unknown>;
    try {
      const model = (await this.settings.resolve('anthropicModel')) ?? 'claude-sonnet-4-5';
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model,
          max_tokens: 2000,
          system: NEWS_SYSTEM_PROMPT,
          messages: [
            {
              role: 'user',
              content: [
                `عنوان اصلی منبع: ${item.rawTitle}`,
                `خلاصه/متن منبع: ${item.rawSummary ?? 'ثبت نشده'}`,
                `منبع: ${item.sourceName}`,
                `آدرس منبع: ${item.sourceUrl}`,
                `تاریخ انتشار منبع: ${item.publishedAt ? item.publishedAt.toISOString() : 'نامشخص'}`,
                item.confidenceNote ? `نکات نامطمئن شناسایی‌شده در بررسی اولیه: ${item.confidenceNote}` : '',
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
      await this.aiUsage.record(id, false, APPROXIMATE_COST_TOMAN);
      this.logger.error('News draft generation failed', err as Error);
      throw new BadRequestException('تولید پیش‌نویس خبر ناموفق بود. لطفاً دوباره تلاش کنید.');
    }
    await this.aiUsage.record(id, true, APPROXIMATE_COST_TOMAN);

    const image = await this.newsImage.resolveImage({ rawTitle: item.rawTitle, imageUrl: item.imageUrl }, baseUrl).catch((err) => {
      this.logger.warn(`News image resolution failed: ${(err as Error).message}`);
      return null;
    });

    const confirmingSources = Array.isArray(parsed.confirmingSources) ? parsed.confirmingSources : [];

    const updated = await this.prisma.newsItem.update({
      where: { id },
      data: {
        status: 'PENDING_REVIEW',
        draftTitle: typeof parsed.title === 'string' ? parsed.title : item.rawTitle,
        draftExcerpt: typeof parsed.excerpt === 'string' ? parsed.excerpt : undefined,
        draftBody: typeof parsed.body === 'string' ? parsed.body : undefined,
        category: typeof parsed.category === 'string' ? parsed.category : undefined,
        tags: typeof parsed.tags === 'string' ? parsed.tags : undefined,
        seoTitle: typeof parsed.seoTitle === 'string' ? parsed.seoTitle : undefined,
        metaDescription: typeof parsed.metaDescription === 'string' ? parsed.metaDescription : undefined,
        keywords: typeof parsed.keywords === 'string' ? parsed.keywords : undefined,
        faq: Array.isArray(parsed.faq) ? (parsed.faq as any) : undefined,
        confirmingSources: confirmingSources as any,
        suggestedImagePrompt: typeof parsed.suggestedImagePrompt === 'string' ? parsed.suggestedImagePrompt : undefined,
        confidenceNote: typeof parsed.confidenceNote === 'string' && parsed.confidenceNote ? parsed.confidenceNote : item.confidenceNote,
        ...(image
          ? { imageUrl: image.imageUrl, imageSource: image.imageSource, imageIsAiGenerated: image.imageIsAiGenerated, imageAttribution: image.imageAttribution }
          : {}),
        createdByUserId: userId,
      },
    });
    await this.auditLog.record({ userId, action: 'news.draft_generated', entityType: 'NewsItem', entityId: id, after: updated });
    return updated;
  }

  async update(id: string, dto: UpdateNewsItemDto, userId?: string) {
    const before = await this.getById(id);
    if (before.status !== 'PENDING_REVIEW') throw new BadRequestException('فقط اخبار در انتظار بررسی قابل ویرایش هستند');
    const item = await this.prisma.newsItem.update({ where: { id }, data: dto as any });
    await this.auditLog.record({ userId, action: 'news.edited', entityType: 'NewsItem', entityId: id, before, after: item });
    return item;
  }

  async reject(id: string, reason: string | undefined, userId?: string) {
    const before = await this.getById(id);
    if (before.status !== 'PENDING_REVIEW') throw new BadRequestException('فقط اخبار در انتظار بررسی قابل رد هستند');
    const item = await this.prisma.newsItem.update({
      where: { id },
      data: { status: 'REJECTED', rejectionReason: reason, reviewedByUserId: userId, reviewedAt: new Date() },
    });
    await this.auditLog.record({ userId, action: 'news.rejected', entityType: 'NewsItem', entityId: id, before, after: item });
    return item;
  }

  // "ذخیره پیش‌نویس" — marks reviewed/APPROVED without publishing anything.
  async approve(id: string, userId?: string) {
    const before = await this.getById(id);
    if (before.status !== 'PENDING_REVIEW') throw new BadRequestException('فقط اخبار در انتظار بررسی قابل تأیید هستند');
    const item = await this.prisma.newsItem.update({
      where: { id },
      data: { status: 'APPROVED', reviewedByUserId: userId, reviewedAt: new Date() },
    });
    await this.auditLog.record({ userId, action: 'news.approved', entityType: 'NewsItem', entityId: id, before, after: item });
    return item;
  }

  // "تأیید و انتشار" — publishes through the real, existing BlogService
  // (a news article IS a BlogPost with a category/tags) — no second content
  // system. Works from either PENDING_REVIEW (direct publish) or a
  // previously-APPROVED item.
  async publish(id: string, userId?: string) {
    const before = await this.getById(id);
    if (before.status !== 'PENDING_REVIEW' && before.status !== 'APPROVED') {
      throw new BadRequestException('فقط اخبار در انتظار بررسی یا تأییدشده قابل انتشار هستند');
    }
    if (!before.draftTitle || !before.draftBody) throw new BadRequestException('عنوان و متن پیش‌نویس برای انتشار الزامی است');

    const post = await this.blog.create(userId ?? '', {
      title: before.draftTitle,
      slug: slugify(before.draftTitle),
      excerpt: before.draftExcerpt ?? undefined,
      content: before.draftBody,
      coverImageUrl: before.imageUrl ?? undefined,
      metaTitle: before.seoTitle ?? undefined,
      metaDescription: before.metaDescription ?? undefined,
      category: before.category ?? undefined,
      tags: before.tags ?? undefined,
    } as any);
    await this.blog.update(post.id, { isPublished: true } as any);

    const item = await this.prisma.newsItem.update({
      where: { id },
      data: { status: 'PUBLISHED', publishedBlogPostId: post.id, reviewedByUserId: userId, reviewedAt: new Date() },
    });
    await this.auditLog.record({ userId, action: 'news.published', entityType: 'NewsItem', entityId: id, before, after: { blogPostId: post.id } });
    return item;
  }
}
