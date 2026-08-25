import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SettingsService } from '../settings/settings.service';
import { CreateAnswerDto, CreateQuestionDto } from './dto/qa.dto';

const SUGGEST_ANSWER_SYSTEM_PROMPT = `شما به یک کارمند فروشگاه اینترنتی «سلطان نور» کمک می‌کنید تا به سوال یک مشتری درباره‌ی
یک محصول پاسخ پیش‌نویس بدهد. فقط و فقط بر اساس اطلاعات واقعی محصول که در ادامه آمده پاسخ بده — هرگز مشخصات، قیمت یا
ویژگی‌ای که در این اطلاعات نیامده را حدس نزن یا نساز. اگر سوال را نمی‌توان از روی این اطلاعات پاسخ داد، صادقانه همین
را بگو و پیشنهاد بده کارمند خودش پاسخ دقیق‌تری بدهد. پاسخ باید کوتاه، فارسی و برای انتشار مستقیم برای مشتری آماده باشد.`;

@Injectable()
export class QaService {
  private readonly logger = new Logger(QaService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private settings: SettingsService,
  ) {}

  // Staff-only: every question across all products, newest first, with an
  // `isAnswered` flag so moderators can find unanswered ones without having
  // to already know which product to look under.
  async listAll() {
    const questions = await this.prisma.question.findMany({
      select: {
        id: true,
        body: true,
        isPublished: true,
        createdAt: true,
        product: { select: { id: true, name: true, slug: true } },
        user: { select: { fullName: true, phone: true } },
        answers: { select: { id: true, body: true, isFromStaff: true, createdAt: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return questions.map((q) => ({ ...q, isAnswered: q.answers.length > 0 }));
  }

  listForProduct(productId: string) {
    // select (not include) at every level so no raw userId scalar is ever
    // returned to this public, unauthenticated endpoint.
    return this.prisma.question.findMany({
      where: { productId, isPublished: true },
      select: {
        id: true,
        body: true,
        createdAt: true,
        user: { select: { fullName: true } },
        answers: {
          select: {
            id: true,
            body: true,
            isFromStaff: true,
            createdAt: true,
            user: { select: { fullName: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  createQuestion(userId: string, dto: CreateQuestionDto) {
    return this.prisma.question.create({ data: { userId, productId: dto.productId, body: dto.body } });
  }

  // Drafts a suggested answer for staff to review, edit, and submit through
  // the normal createAnswer flow — it never posts anything itself. Grounded
  // strictly in this question's own product record (name/description/
  // brand/category) so it can't invent specs that were never entered.
  async suggestAnswer(questionId: string): Promise<{ suggestion: string | null; reason?: string }> {
    const question = await this.prisma.question.findUnique({
      where: { id: questionId },
      select: {
        body: true,
        product: {
          select: { name: true, description: true, basePrice: true, brand: { select: { name: true } }, category: { select: { name: true } } },
        },
      },
    });
    if (!question) throw new NotFoundException('پرسش یافت نشد');

    const apiKey = await this.settings.resolve('anthropicApiKey');
    if (!apiKey) {
      return { suggestion: null, reason: 'برای این قابلیت باید کلید API هوش مصنوعی در بخش تنظیمات وارد شود.' };
    }

    const productInfo = {
      نام: question.product.name,
      توضیحات: question.product.description ?? 'ثبت نشده',
      برند: question.product.brand?.name ?? 'ثبت نشده',
      دسته‌بندی: question.product.category?.name ?? 'ثبت نشده',
      قیمت: `${Number(question.product.basePrice).toLocaleString('fa-IR')} تومان`,
    };

    try {
      const model = (await this.settings.resolve('anthropicModel')) ?? 'claude-sonnet-4-5';
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model,
          max_tokens: 300,
          system: SUGGEST_ANSWER_SYSTEM_PROMPT,
          messages: [
            { role: 'user', content: `اطلاعات محصول:\n${JSON.stringify(productInfo, null, 2)}\n\nسوال مشتری: ${question.body}` },
          ],
        }),
      });
      const data = await res.json();
      const suggestion = data.content?.[0]?.text;
      if (!suggestion) return { suggestion: null, reason: 'دستیار هوشمند پاسخی برنگرداند.' };
      return { suggestion };
    } catch (err) {
      this.logger.error('QA answer suggestion failed', err as Error);
      return { suggestion: null, reason: 'خطا در ارتباط با دستیار هوشمند.' };
    }
  }

  async createAnswer(userId: string, userRole: Role, questionId: string, dto: CreateAnswerDto) {
    const question = await this.prisma.question.findUnique({ where: { id: questionId } });
    if (!question) throw new NotFoundException('پرسش یافت نشد');

    const staffRoles: Role[] = [Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF];
    const isFromStaff = staffRoles.includes(userRole);
    const answer = await this.prisma.answer.create({
      data: { userId, questionId, body: dto.body, isFromStaff },
    });

    if (isFromStaff) {
      await this.notifications.notify(question.userId, 'QA_REPLY', 'پاسخ به پرسش شما', dto.body);
    }

    return answer;
  }
}
