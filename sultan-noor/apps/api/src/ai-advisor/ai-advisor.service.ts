import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SearchService } from '../search/search.service';
import { SettingsService } from '../settings/settings.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AskAdvisorDto, StaffReplyDto } from './dto/ai-advisor.dto';

const SYSTEM_PROMPT = `شما دستیار خرید فروشگاه اینترنتی «سلطان نور» هستید. بر اساس نیاز مشتری و فهرست
محصولات مرتبطی که در ادامه آمده، بهترین گزینه‌ها را به فارسی و به‌صورت خلاصه پیشنهاد دهید.
اگر هیچ محصول مرتبطی وجود نداشت، صادقانه بگویید و پیشنهاد جستجوی دیگری بدهید.`;

// Retrieval-augmented shopping advisor: grounds every answer in real catalog
// search results so it never invents products/prices, then (optionally) asks
// an LLM to turn those results into a natural-language recommendation.
@Injectable()
export class AiAdvisorService {
  private readonly logger = new Logger(AiAdvisorService.name);

  constructor(
    private prisma: PrismaService,
    private search: SearchService,
    private settings: SettingsService,
    private notifications: NotificationsService,
  ) {}

  async ask(userId: string | undefined, dto: AskAdvisorDto) {
    const conversation = dto.conversationId
      ? await this.prisma.aiConversation.findUniqueOrThrow({ where: { id: dto.conversationId }, include: { messages: true } })
      : await this.prisma.aiConversation.create({ data: { userId }, include: { messages: true } });

    await this.prisma.aiMessage.create({ data: { conversationId: conversation.id, role: 'USER', content: dto.message } });

    // Once a human has taken over, the bot stays quiet — the customer is
    // now talking to staff, and an auto-reply here would talk over them.
    if (conversation.escalatedAt && !conversation.resolvedAt) {
      return { conversationId: conversation.id, reply: null, suggestedProducts: [], awaitingStaff: true };
    }

    const { hits } = await this.search.searchProducts(dto.message, { limit: 5 });

    const reply = await this.generateReply(dto.message, hits);

    await this.prisma.aiMessage.create({ data: { conversationId: conversation.id, role: 'ASSISTANT', content: reply } });

    return { conversationId: conversation.id, reply, suggestedProducts: hits, awaitingStaff: false };
  }

  async getConversation(conversationId: string) {
    const conversation = await this.prisma.aiConversation.findUnique({
      where: { id: conversationId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!conversation) throw new NotFoundException('گفتگو یافت نشد');
    return conversation;
  }

  // Idempotent while a request is still pending (re-requesting on an
  // already-escalated, unresolved conversation just returns its current
  // state instead of re-notifying staff every time). A conversation that
  // was previously resolved can be escalated again — that's a customer
  // reopening the thread for a new issue, not a duplicate of the old one.
  async escalate(conversationId: string) {
    const conversation = await this.prisma.aiConversation.findUnique({ where: { id: conversationId } });
    if (!conversation) throw new NotFoundException('گفتگو یافت نشد');

    if (!conversation.escalatedAt || conversation.resolvedAt) {
      await this.prisma.aiConversation.update({
        where: { id: conversationId },
        data: { escalatedAt: new Date(), resolvedAt: null },
      });
      await this.prisma.aiMessage.create({
        data: { conversationId, role: 'SYSTEM', content: 'کاربر درخواست صحبت با پشتیبان انسانی را ثبت کرد.' },
      });
      await this.notifyStaffOfEscalation();
    }

    return this.getConversation(conversationId);
  }

  async listEscalated() {
    return this.prisma.aiConversation.findMany({
      where: { escalatedAt: { not: null }, resolvedAt: null },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        user: { select: { id: true, fullName: true, phone: true } },
      },
      orderBy: { escalatedAt: 'asc' },
    });
  }

  async staffReply(conversationId: string, dto: StaffReplyDto) {
    const conversation = await this.prisma.aiConversation.findUnique({ where: { id: conversationId } });
    if (!conversation) throw new NotFoundException('گفتگو یافت نشد');
    await this.prisma.aiMessage.create({ data: { conversationId, role: 'STAFF', content: dto.message } });
    return this.getConversation(conversationId);
  }

  async resolve(conversationId: string) {
    const conversation = await this.prisma.aiConversation.findUnique({ where: { id: conversationId } });
    if (!conversation) throw new NotFoundException('گفتگو یافت نشد');
    return this.prisma.aiConversation.update({ where: { id: conversationId }, data: { resolvedAt: new Date() } });
  }

  private async notifyStaffOfEscalation() {
    const staff = await this.prisma.user.findMany({
      where: { role: { in: ['SUPER_ADMIN', 'ADMIN', 'STAFF'] } },
      select: { id: true },
    });
    await Promise.all(
      staff.map((s) =>
        this.notifications.notify(s.id, 'SYSTEM', 'درخواست پشتیبانی انسانی', 'یک مشتری در گفتگوی هوشمند درخواست صحبت با پشتیبان کرده است.'),
      ),
    );
  }

  private async generateReply(userMessage: string, products: unknown[]): Promise<string> {
    const apiKey = await this.settings.resolve('anthropicApiKey');
    if (!apiKey) {
      // Rule-based fallback so the advisor works without an LLM key configured.
      if (!products.length) {
        return 'در حال حاضر محصولی متناسب با درخواست شما پیدا نکردم. لطفاً با کلمات دیگری امتحان کنید یا با پشتیبانی تماس بگیرید.';
      }
      const names = (products as any[]).slice(0, 3).map((p) => p.name).join('، ');
      return `بر اساس نیاز شما، این گزینه‌ها را پیشنهاد می‌کنم: ${names}.`;
    }

    try {
      const model = (await this.settings.resolve('anthropicModel')) ?? 'claude-sonnet-4-5';
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: 400,
          system: SYSTEM_PROMPT,
          messages: [
            { role: 'user', content: `درخواست مشتری: ${userMessage}\n\nمحصولات مرتبط:\n${JSON.stringify(products, null, 2)}` },
          ],
        }),
      });
      const data = await res.json();
      return data.content?.[0]?.text ?? 'در حال حاضر امکان پاسخ‌گویی وجود ندارد.';
    } catch (err) {
      this.logger.error('AI advisor call failed', err as Error);
      return 'خطایی در ارتباط با دستیار هوشمند رخ داد. لطفاً بعداً دوباره تلاش کنید.';
    }
  }
}
