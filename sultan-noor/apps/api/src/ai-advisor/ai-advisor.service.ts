import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SearchService } from '../search/search.service';
import { SettingsService } from '../settings/settings.service';
import { AskAdvisorDto } from './dto/ai-advisor.dto';

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
  ) {}

  async ask(userId: string | undefined, dto: AskAdvisorDto) {
    const conversation = dto.conversationId
      ? await this.prisma.aiConversation.findUniqueOrThrow({ where: { id: dto.conversationId }, include: { messages: true } })
      : await this.prisma.aiConversation.create({ data: { userId }, include: { messages: true } });

    await this.prisma.aiMessage.create({ data: { conversationId: conversation.id, role: 'USER', content: dto.message } });

    const { hits } = await this.search.searchProducts(dto.message, { limit: 5 });

    const reply = await this.generateReply(dto.message, hits);

    await this.prisma.aiMessage.create({ data: { conversationId: conversation.id, role: 'ASSISTANT', content: reply } });

    return { conversationId: conversation.id, reply, suggestedProducts: hits };
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
