import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { SmsProvider } from '../auth/sms.provider';

// A cart counts as "abandoned" once it's sat untouched for this long...
const ABANDONED_AFTER_MS = 3 * 60 * 60 * 1000; // 3 hours
// ...but skip carts older than this — texting someone about a cart they left
// weeks ago is more likely to annoy than convert, and costs real SMS credit.
const IGNORE_OLDER_THAN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

@Injectable()
export class CartRecoveryService {
  private readonly logger = new Logger(CartRecoveryService.name);

  constructor(
    private prisma: PrismaService,
    private smsProvider: SmsProvider,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async sendAbandonedCartReminders() {
    const now = Date.now();
    const carts = await this.prisma.cart.findMany({
      where: {
        abandonedReminderSentAt: null,
        updatedAt: { lte: new Date(now - ABANDONED_AFTER_MS), gte: new Date(now - IGNORE_OLDER_THAN_MS) },
        items: { some: {} },
      },
      include: {
        user: { select: { phone: true } },
        items: { take: 1, include: { product: { select: { name: true } } } },
        _count: { select: { items: true } },
      },
    });

    for (const cart of carts) {
      const firstItemName = cart.items[0]?.product.name;
      if (!firstItemName) continue;

      const otherItemCount = cart._count.items - 1;
      const text =
        otherItemCount > 0
          ? `سلطان نور: «${firstItemName}» و ${otherItemCount} کالای دیگر در سبد خرید شما منتظر است. برای تکمیل خرید به سایت مراجعه کنید.`
          : `سلطان نور: «${firstItemName}» در سبد خرید شما منتظر است. برای تکمیل خرید به سایت مراجعه کنید.`;

      try {
        await this.smsProvider.sendText(cart.user.phone, text);
      } catch (err) {
        this.logger.error(`ارسال پیامک یادآوری سبد خرید به ${cart.user.phone} ناموفق بود: ${(err as Error).message}`);
      }

      await this.prisma.cart.update({ where: { id: cart.id }, data: { abandonedReminderSentAt: new Date() } });
    }
  }
}
