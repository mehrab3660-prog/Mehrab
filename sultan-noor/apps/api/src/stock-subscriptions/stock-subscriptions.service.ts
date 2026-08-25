import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SmsProvider } from '../auth/sms.provider';

@Injectable()
export class StockSubscriptionsService {
  private readonly logger = new Logger(StockSubscriptionsService.name);

  constructor(
    private prisma: PrismaService,
    private smsProvider: SmsProvider,
  ) {}

  async subscribe(userId: string, productId: string) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException('محصول یافت نشد');

    return this.prisma.stockSubscription.upsert({
      where: { userId_productId: { userId, productId } },
      create: { userId, productId },
      // A prior (already-fired) subscription for this product can be reused
      // for a fresh out-of-stock period instead of erroring as a duplicate.
      update: { notifiedAt: null },
    });
  }

  async unsubscribe(userId: string, productId: string) {
    await this.prisma.stockSubscription.deleteMany({ where: { userId, productId } });
  }

  // Called once a product variant's stock rises from empty to available.
  // Texts every pending subscriber for that product and marks them notified
  // so the same restock never texts a subscriber twice.
  async notifyBackInStock(productId: string) {
    const subscriptions = await this.prisma.stockSubscription.findMany({
      where: { productId, notifiedAt: null },
      include: { user: { select: { phone: true } }, product: { select: { name: true, slug: true } } },
    });
    if (subscriptions.length === 0) return;

    for (const sub of subscriptions) {
      try {
        await this.smsProvider.sendText(
          sub.user.phone,
          `سلطان نور: «${sub.product.name}» دوباره موجود شد. برای خرید به سایت مراجعه کنید.`,
        );
      } catch (err) {
        this.logger.error(`ارسال پیامک بازگشت به موجودی به ${sub.user.phone} ناموفق بود: ${(err as Error).message}`);
      }
    }

    await this.prisma.stockSubscription.updateMany({
      where: { id: { in: subscriptions.map((s) => s.id) } },
      data: { notifiedAt: new Date() },
    });
  }
}
