import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { SmsProvider } from '../auth/sms.provider';

function formatToman(value: number) {
  return `${value.toLocaleString('fa-IR')} تومان`;
}

@Injectable()
export class WishlistPriceAlertService {
  private readonly logger = new Logger(WishlistPriceAlertService.name);

  constructor(
    private prisma: PrismaService,
    private smsProvider: SmsProvider,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async sendPriceDropAlerts() {
    const items = await this.prisma.wishlistItem.findMany({
      include: {
        wishlist: { select: { user: { select: { phone: true } } } },
        product: { select: { name: true, basePrice: true } },
      },
    });

    for (const item of items) {
      const currentPrice = Number(item.product.basePrice);
      const referencePrice = Number(item.lastAlertedPrice ?? item.priceAtAdd);
      if (currentPrice >= referencePrice) continue;

      try {
        await this.smsProvider.sendText(
          item.wishlist.user.phone,
          `سلطان نور: قیمت «${item.product.name}» در لیست علاقه‌مندی‌های شما کاهش یافت و اکنون ${formatToman(currentPrice)} است.`,
        );
        await this.prisma.wishlistItem.update({ where: { id: item.id }, data: { lastAlertedPrice: currentPrice } });
      } catch (err) {
        this.logger.error(`ارسال پیامک کاهش قیمت به ${item.wishlist.user.phone} ناموفق بود: ${(err as Error).message}`);
      }
    }
  }
}
