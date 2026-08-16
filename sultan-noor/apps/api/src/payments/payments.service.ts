import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SettingsService } from '../settings/settings.service';
import { InitiatePaymentDto, VerifyPaymentDto } from './dto/payment.dto';

const ZARINPAL_BASE = 'https://api.zarinpal.com/pg/v4/payment';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private settings: SettingsService,
  ) {}

  async initiate(userId: string, dto: InitiatePaymentDto) {
    const order = await this.prisma.order.findFirst({ where: { id: dto.orderId, userId } });
    if (!order) throw new NotFoundException('سفارش یافت نشد');
    if (order.status !== 'PENDING_PAYMENT') throw new BadRequestException('این سفارش قابل پرداخت نیست');

    const merchantId = await this.settings.resolve('zarinpalMerchantId');
    const siteUrl = (await this.settings.resolve('siteUrl'))?.split(',')[0] ?? 'http://localhost:3000';
    const callbackUrl = `${siteUrl}/checkout/callback?orderId=${order.id}`;

    let authority: string;
    let paymentUrl: string;

    if (!merchantId) {
      // No merchant credentials configured — issue a fake authority so the
      // full checkout → payment → order-confirmed flow works in dev/testing.
      authority = `SANDBOX-${randomUUID()}`;
      paymentUrl = `${callbackUrl}&Authority=${authority}&Status=OK`;
      this.logger.warn(`[SANDBOX PAYMENT] order=${order.orderNumber} authority=${authority}`);
    } else {
      const res = await fetch(`${ZARINPAL_BASE}/request.json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchant_id: merchantId,
          amount: Number(order.grandTotal) * 10, // تومان به ریال
          callback_url: callbackUrl,
          description: `پرداخت سفارش ${order.orderNumber}`,
        }),
      });
      const data = await res.json();
      if (data.data?.code !== 100) throw new BadRequestException('خطا در ایجاد تراکنش پرداخت');
      authority = data.data.authority;
      paymentUrl = `https://www.zarinpal.com/pg/StartPay/${authority}`;
    }

    await this.prisma.payment.create({
      data: { orderId: order.id, gateway: 'ZARINPAL', status: 'INITIATED', amount: order.grandTotal, authority },
    });

    return { paymentUrl, authority };
  }

  async verify(dto: VerifyPaymentDto) {
    const payment = await this.prisma.payment.findFirst({
      where: { orderId: dto.orderId, authority: dto.authority },
      include: { order: true },
    });
    if (!payment) throw new NotFoundException('تراکنش یافت نشد');

    const merchantId = await this.settings.resolve('zarinpalMerchantId');
    let succeeded: boolean;
    let refId: string | undefined;

    if (!merchantId) {
      succeeded = true;
      refId = `SANDBOX-REF-${Date.now()}`;
    } else {
      const res = await fetch(`${ZARINPAL_BASE}/verify.json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchant_id: merchantId,
          amount: Number(payment.amount) * 10,
          authority: dto.authority,
        }),
      });
      const data = await res.json();
      succeeded = data.data?.code === 100 || data.data?.code === 101;
      refId = data.data?.ref_id ? String(data.data.ref_id) : undefined;
    }

    const updated = await this.prisma.payment.update({
      where: { id: payment.id },
      data: { status: succeeded ? 'SUCCEEDED' : 'FAILED', refId },
    });

    if (succeeded) {
      await this.prisma.order.update({
        where: { id: payment.orderId },
        data: { status: 'PROCESSING', statusHistory: { create: { status: 'PROCESSING', note: 'پرداخت موفق' } } },
      });
      await this.notifications.notify(payment.order.userId, 'ORDER_UPDATE', 'پرداخت موفق', `سفارش ${payment.order.orderNumber} پرداخت شد.`);
    }

    return { succeeded, refId, payment: updated };
  }
}
