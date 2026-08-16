import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Order } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SettingsService } from '../settings/settings.service';
import { InitiatePaymentDto, VerifyPaymentDto } from './dto/payment.dto';

const ZARINPAL_BASE = 'https://api.zarinpal.com/pg/v4/payment';
const IDPAY_BASE = 'https://api.idpay.ir/v1.1/payment';

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

    if (dto.gateway === 'CASH_ON_DELIVERY') {
      return this.initiateCashOnDelivery(order);
    }
    if (dto.gateway === 'IDPAY') {
      return this.initiateIdpay(order);
    }

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

  // No external gateway involved — the customer pays the courier when the
  // order arrives, so there's nothing to redirect to or later verify. The
  // order moves straight to PROCESSING; the Payment stays INITIATED (money
  // hasn't actually changed hands yet) until an admin marks it collected.
  private async initiateCashOnDelivery(order: Order) {
    const payment = await this.prisma.payment.create({
      data: { orderId: order.id, gateway: 'CASH_ON_DELIVERY', status: 'INITIATED', amount: order.grandTotal },
    });

    await this.prisma.order.update({
      where: { id: order.id },
      data: { status: 'PROCESSING', statusHistory: { create: { status: 'PROCESSING', note: 'سفارش با پرداخت در محل ثبت شد' } } },
    });

    await this.notifications.notify(
      order.userId,
      'ORDER_UPDATE',
      'سفارش ثبت شد',
      `سفارش ${order.orderNumber} با پرداخت در محل ثبت شد و در حال آماده‌سازی است.`,
    );

    return { paymentUrl: null, codConfirmed: true, paymentId: payment.id };
  }

  private async initiateIdpay(order: Order) {
    const apiKey = await this.settings.resolve('idpayApiKey');
    const siteUrl = (await this.settings.resolve('siteUrl'))?.split(',')[0] ?? 'http://localhost:3000';
    const callbackUrl = `${siteUrl}/checkout/callback?orderId=${order.id}`;

    let authority: string;
    let paymentUrl: string;

    if (!apiKey) {
      // No API key configured — same dev/testing sandbox convention as the
      // Zarinpal branch: a fake transaction id that resolves the callback
      // straight through without ever calling the real IDPay API.
      authority = `SANDBOX-IDPAY-${randomUUID()}`;
      paymentUrl = `${callbackUrl}&id=${authority}`;
      this.logger.warn(`[SANDBOX PAYMENT] order=${order.orderNumber} authority=${authority}`);
    } else {
      const res = await fetch(`${IDPAY_BASE}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-KEY': apiKey },
        body: JSON.stringify({
          order_id: order.id,
          amount: Number(order.grandTotal) * 10, // تومان به ریال
          callback: callbackUrl,
          desc: `پرداخت سفارش ${order.orderNumber}`,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.id) throw new BadRequestException('خطا در ایجاد تراکنش پرداخت');
      authority = data.id;
      paymentUrl = data.link;
    }

    await this.prisma.payment.create({
      data: { orderId: order.id, gateway: 'IDPAY', status: 'INITIATED', amount: order.grandTotal, authority },
    });

    return { paymentUrl, authority };
  }

  async verify(userId: string, dto: VerifyPaymentDto) {
    const payment = await this.prisma.payment.findFirst({
      where: { orderId: dto.orderId, authority: dto.authority, order: { userId } },
      include: { order: true },
    });
    if (!payment) throw new NotFoundException('تراکنش یافت نشد');

    // Idempotent: a duplicate callback (page reload, retried redirect) for an
    // already-settled payment must not re-verify with the gateway, re-decrement
    // anything, or re-notify the customer — just report the existing result.
    if (payment.status === 'SUCCEEDED' || payment.status === 'FAILED') {
      return { succeeded: payment.status === 'SUCCEEDED', refId: payment.refId ?? undefined, payment };
    }

    const { succeeded, refId } =
      payment.gateway === 'IDPAY' ? await this.verifyIdpay(payment) : await this.verifyZarinpal(payment, dto.authority);

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

  private async verifyZarinpal(payment: { amount: unknown }, authority: string): Promise<{ succeeded: boolean; refId?: string }> {
    const merchantId = await this.settings.resolve('zarinpalMerchantId');
    if (!merchantId) {
      return { succeeded: true, refId: `SANDBOX-REF-${Date.now()}` };
    }

    const res = await fetch(`${ZARINPAL_BASE}/verify.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        merchant_id: merchantId,
        amount: Number(payment.amount) * 10,
        authority,
      }),
    });
    const data = await res.json();
    const succeeded = data.data?.code === 100 || data.data?.code === 101;
    const refId = data.data?.ref_id ? String(data.data.ref_id) : undefined;
    return { succeeded, refId };
  }

  private async verifyIdpay(payment: { orderId: string; authority: string | null }): Promise<{ succeeded: boolean; refId?: string }> {
    const apiKey = await this.settings.resolve('idpayApiKey');
    if (!apiKey) {
      return { succeeded: true, refId: `SANDBOX-REF-${Date.now()}` };
    }

    const res = await fetch(`${IDPAY_BASE}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-KEY': apiKey },
      body: JSON.stringify({ id: payment.authority, order_id: payment.orderId }),
    });
    const data = await res.json();
    // 100 = verified successfully, 101 = already verified before.
    const succeeded = data.status === 100 || data.status === 101;
    const refId = data.track_id ? String(data.track_id) : undefined;
    return { succeeded, refId };
  }
}
