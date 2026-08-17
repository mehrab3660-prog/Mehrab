import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomInt } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ProductsService } from '../catalog/products/products.service';
import { PricingService } from '../pricing/pricing.service';
import { InvoiceService } from './invoice/invoice.service';
import { AuditLogService } from '../audit/audit-log.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ShippingService } from '../shipping/shipping.service';
import { SmsProvider } from '../auth/sms.provider';
import { CreateOrderDto, UpdateOrderStatusDto } from './dto/order.dto';
import {
  LOYALTY_EARN_DIVISOR_TOMAN,
  LOYALTY_MAX_REDEMPTION_RATIO,
  LOYALTY_POINT_VALUE_TOMAN,
  REFERRAL_BONUS_POINTS,
} from '../loyalty/loyalty.constants';

const ORDER_STATUS_SMS_LABELS: Record<string, string> = {
  PROCESSING: 'در حال آماده‌سازی',
  SHIPPED: 'ارسال شد',
  DELIVERED: 'تحویل داده شد',
  CANCELLED: 'لغو شد',
  REFUNDED: 'مبلغ آن بازگردانده شد',
};

// Matches the admin dashboard's own "low stock" count (dashboard.service.ts)
// so a warehouse manager's alert threshold always agrees with what they see
// on the summary page.
const LOW_STOCK_THRESHOLD = 5;

@Injectable()
export class OrdersService {
  constructor(
    private prisma: PrismaService,
    private productsService: ProductsService,
    private pricingService: PricingService,
    private invoiceService: InvoiceService,
    private auditLog: AuditLogService,
    private notifications: NotificationsService,
    private shippingService: ShippingService,
    private smsProvider: SmsProvider,
  ) {}

  async createFromCart(userId: string, dto: CreateOrderDto) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const cart = await this.prisma.cart.findFirst({
      where: { userId },
      include: { items: { include: { product: true, productVariant: true } } },
    });
    if (!cart || cart.items.length === 0) throw new BadRequestException('سبد خرید خالی است');

    const address = await this.prisma.address.findFirst({ where: { id: dto.addressId, userId } });
    if (!address) throw new NotFoundException('آدرس یافت نشد');

    if (dto.deliveryDate && !dto.deliverySlot) throw new BadRequestException('بازه‌ی زمانی تحویل را انتخاب کنید');
    if (dto.deliverySlot && !dto.deliveryDate) throw new BadRequestException('تاریخ تحویل را انتخاب کنید');
    let deliveryDate: Date | undefined;
    if (dto.deliveryDate) {
      deliveryDate = new Date(dto.deliveryDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (deliveryDate < today) throw new BadRequestException('تاریخ تحویل نمی‌تواند در گذشته باشد');
    }

    // Price each line at current tiered pricing and verify stock availability.
    const pricedItems = await Promise.all(
      cart.items.map(async (item) => {
        const unitPrice = await this.productsService.resolveUnitPrice(item.productId, user.customerGroupId, item.quantity);
        return {
          productId: item.productId,
          productVariantId: item.productVariantId,
          nameSnapshot: item.product.name,
          skuSnapshot: item.productVariant?.sku,
          unitPrice,
          quantity: item.quantity,
          lineTotal: unitPrice * item.quantity,
        };
      }),
    );

    const subtotal = pricedItems.reduce((sum, i) => sum + i.lineTotal, 0);

    let discountTotal = 0;
    let discountCodeId: string | undefined;
    if (dto.discountCode) {
      const { discount, amount } = await this.pricingService.evaluateDiscountCode(dto.discountCode, userId, subtotal);
      discountTotal = amount;
      discountCodeId = discount.id;
    }

    const redeemLoyaltyPoints = dto.redeemLoyaltyPoints ?? 0;
    let loyaltyDiscount = 0;
    if (redeemLoyaltyPoints > 0) {
      if (redeemLoyaltyPoints > user.loyaltyPoints) throw new BadRequestException('امتیاز درخواستی بیشتر از موجودی شماست');
      loyaltyDiscount = redeemLoyaltyPoints * LOYALTY_POINT_VALUE_TOMAN;
      const maxLoyaltyDiscount = Math.floor((subtotal - discountTotal) * LOYALTY_MAX_REDEMPTION_RATIO);
      if (loyaltyDiscount > maxLoyaltyDiscount) {
        throw new BadRequestException('امتیاز قابل استفاده در این سفارش حداکثر تا نیمی از مبلغ آن است');
      }
    }

    const shippingTotal = await this.shippingService.resolveShippingCost(
      cart.items.map((item) => ({ quantity: item.quantity, productVariant: item.productVariant })),
      address.province,
    );
    const grandTotal = Math.max(subtotal - discountTotal - loyaltyDiscount + shippingTotal, 0);
    const orderNumber = this.generateOrderNumber();

    const lowStockAlerts: { name: string; sku?: string; remaining: number }[] = [];

    // A missing variant here would silently skip the stock check entirely —
    // CartService.addItem always resolves one, but this stays a hard error
    // as defense in depth rather than a silent `continue`.
    const missingVariant = pricedItems.find((i) => !i.productVariantId);
    if (missingVariant) throw new BadRequestException(`گزینه‌ی محصول برای «${missingVariant.nameSnapshot}» نامشخص است`);

    const order = await this.prisma.$transaction(async (tx) => {
      // Smart warehouse routing: prefer fulfilling the whole order from a
      // single active warehouse (avoids splitting one order's picking/
      // shipping across locations). Only when no single warehouse holds
      // enough of everything do we fall back to a per-item best fit — the
      // sufficient warehouse with the least stock, so warehouses with more
      // headroom stay free for orders that need it.
      const variantIds = pricedItems.map((i) => i.productVariantId!);
      const stockRows = await tx.stock.findMany({
        where: { productVariantId: { in: variantIds }, warehouse: { isActive: true } },
      });

      const byWarehouse = new Map<string, typeof stockRows>();
      for (const row of stockRows) {
        const list = byWarehouse.get(row.warehouseId) ?? [];
        list.push(row);
        byWarehouse.set(row.warehouseId, list);
      }

      let singleWarehouseId: string | null = null;
      let singleWarehouseTotal = Infinity;
      for (const [warehouseId, rows] of byWarehouse) {
        const canFulfillAll = pricedItems.every((item) =>
          rows.some((r) => r.productVariantId === item.productVariantId && r.quantity >= item.quantity),
        );
        if (!canFulfillAll) continue;
        const total = rows.reduce((sum, r) => sum + r.quantity, 0);
        if (total < singleWarehouseTotal) {
          singleWarehouseId = warehouseId;
          singleWarehouseTotal = total;
        }
      }

      const itemsWithWarehouse: ((typeof pricedItems)[number] & { fulfillmentWarehouseId: string })[] = [];
      for (const item of pricedItems) {
        const stock = singleWarehouseId
          ? stockRows.find((r) => r.warehouseId === singleWarehouseId && r.productVariantId === item.productVariantId)
          : stockRows
              .filter((r) => r.productVariantId === item.productVariantId && r.quantity >= item.quantity)
              .sort((a, b) => a.quantity - b.quantity)[0];
        if (!stock) throw new BadRequestException(`موجودی کافی برای «${item.nameSnapshot}» وجود ندارد`);

        const updatedStock = await tx.stock.update({
          where: { id: stock.id },
          data: { quantity: { decrement: item.quantity } },
        });
        // Only fire the moment this warehouse row crosses into low-stock —
        // not on every order against an already-low row — so the manager
        // gets one alert per depletion, not one per subsequent sale.
        if (stock.quantity > LOW_STOCK_THRESHOLD && updatedStock.quantity <= LOW_STOCK_THRESHOLD) {
          lowStockAlerts.push({ name: item.nameSnapshot, sku: item.skuSnapshot, remaining: updatedStock.quantity });
        }
        itemsWithWarehouse.push({ ...item, fulfillmentWarehouseId: stock.warehouseId });
      }

      const created = await tx.order.create({
        data: {
          orderNumber,
          userId,
          addressId: address.id,
          subtotal,
          discountTotal,
          shippingTotal,
          taxTotal: 0,
          grandTotal,
          discountCodeId,
          deliveryDate,
          deliverySlot: dto.deliverySlot,
          loyaltyPointsRedeemed: redeemLoyaltyPoints,
          loyaltyDiscount,
          items: { create: itemsWithWarehouse },
          statusHistory: { create: { status: 'PENDING_PAYMENT', note: 'سفارش ثبت شد' } },
        },
        include: { items: true },
      });

      if (discountCodeId) {
        await tx.discountCode.update({ where: { id: discountCodeId }, data: { usedCount: { increment: 1 } } });
      }

      if (redeemLoyaltyPoints > 0) {
        const updatedUser = await tx.user.update({
          where: { id: userId },
          data: { loyaltyPoints: { decrement: redeemLoyaltyPoints } },
        });
        await tx.loyaltyTransaction.create({
          data: {
            userId,
            orderId: created.id,
            type: 'REDEEMED',
            points: -redeemLoyaltyPoints,
            balanceAfter: updatedUser.loyaltyPoints,
            note: `استفاده در سفارش ${created.orderNumber}`,
          },
        });
      }

      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });

      return created;
    });

    await this.notifications.notify(userId, 'ORDER_UPDATE', 'سفارش شما ثبت شد', `سفارش ${order.orderNumber} در انتظار پرداخت است.`);

    if (lowStockAlerts.length > 0) {
      void this.notifyLowStock(lowStockAlerts).catch(() => undefined);
    }

    return order;
  }

  private async notifyLowStock(alerts: { name: string; sku?: string; remaining: number }[]) {
    const managers = await this.prisma.user.findMany({ where: { role: 'WAREHOUSE_MANAGER' }, select: { id: true } });
    for (const alert of alerts) {
      const body = `«${alert.name}»${alert.sku ? ` (${alert.sku})` : ''} تنها ${alert.remaining} عدد باقی مانده است.`;
      await Promise.all(managers.map((m) => this.notifications.notify(m.id, 'SYSTEM', 'هشدار موجودی کم', body)));
    }
  }

  async get(userId: string, id: string, isAdmin: boolean) {
    const order = await this.prisma.order.findFirst({
      where: { id, ...(isAdmin ? {} : { userId }) },
      include: { items: true, address: true, statusHistory: { orderBy: { createdAt: 'asc' } }, invoice: true, payments: true },
    });
    if (!order) throw new NotFoundException('سفارش یافت نشد');
    return order;
  }

  async listForUser(userId: string) {
    return this.prisma.order.findMany({ where: { userId }, include: { items: true }, orderBy: { createdAt: 'desc' } });
  }

  async listAll(skip = 0, take = 20) {
    const [items, total] = await Promise.all([
      this.prisma.order.findMany({
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          // Never the raw user row (passwordHash, nationalId) — only what
          // the admin order list actually displays.
          user: { select: { id: true, fullName: true, phone: true } },
          items: true,
        },
      }),
      this.prisma.order.count(),
    ]);
    return { items, total };
  }

  async updateStatus(adminId: string, id: string, dto: UpdateOrderStatusDto) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { user: { select: { phone: true, referredByUserId: true, referralRewardedAt: true } } },
    });
    if (!order) throw new NotFoundException('سفارش یافت نشد');

    const updated = await this.prisma.order.update({
      where: { id },
      data: { status: dto.status, statusHistory: { create: { status: dto.status, note: dto.note } } },
    });

    await this.auditLog.record({
      userId: adminId,
      action: 'order.status_update',
      entityType: 'Order',
      entityId: id,
      before: { status: order.status },
      after: { status: dto.status },
    });

    await this.notifications.notify(order.userId, 'ORDER_UPDATE', 'وضعیت سفارش تغییر کرد', `سفارش ${order.orderNumber}: ${dto.status}`);

    const smsLabel = ORDER_STATUS_SMS_LABELS[dto.status];
    if (smsLabel) {
      void this.smsProvider
        .sendText(order.user.phone, `سلطان نور: سفارش ${order.orderNumber} ${smsLabel}.`)
        .catch(() => undefined);
    }

    if (dto.status === 'DELIVERED' || dto.status === 'PROCESSING') {
      await this.invoiceService.generateForOrder(id).catch(() => undefined);
    }

    if (dto.status === 'DELIVERED') {
      // Cash-on-delivery money only actually changes hands at the door —
      // reaching DELIVERED is what "collected" means for that payment.
      await this.prisma.payment.updateMany({
        where: { orderId: id, gateway: 'CASH_ON_DELIVERY', status: 'INITIATED' },
        data: { status: 'SUCCEEDED' },
      });
    }

    if (dto.status === 'DELIVERED' && !order.loyaltyPointsAwardedAt) {
      await this.awardLoyaltyPoints(order);
    }

    if ((dto.status === 'CANCELLED' || dto.status === 'REFUNDED') && !order.loyaltyPointsReversedAt) {
      await this.reverseLoyaltyPoints(order);
    }

    if (dto.status === 'DELIVERED' && order.user.referredByUserId && !order.user.referralRewardedAt) {
      await this.awardReferralBonus(order.userId, order.user.referredByUserId, order.orderNumber);
    }

    return updated;
  }

  // A purchase only earns points once it's actually delivered — not on
  // placement, so a never-completed order can't mint points. Guarded by
  // loyaltyPointsAwardedAt so a status re-saved as DELIVERED never double-pays.
  private async awardLoyaltyPoints(order: { id: string; userId: string; orderNumber: string; subtotal: unknown; discountTotal: unknown; loyaltyDiscount: unknown }) {
    const earnableBase = Number(order.subtotal) - Number(order.discountTotal) - Number(order.loyaltyDiscount);
    const pointsEarned = Math.max(0, Math.floor(earnableBase / LOYALTY_EARN_DIVISOR_TOMAN));

    await this.prisma.$transaction(async (tx) => {
      if (pointsEarned > 0) {
        const updatedUser = await tx.user.update({
          where: { id: order.userId },
          data: { loyaltyPoints: { increment: pointsEarned } },
        });
        await tx.loyaltyTransaction.create({
          data: {
            userId: order.userId,
            orderId: order.id,
            type: 'EARNED',
            points: pointsEarned,
            balanceAfter: updatedUser.loyaltyPoints,
            note: `خرید سفارش ${order.orderNumber}`,
          },
        });
      }
      await tx.order.update({ where: { id: order.id }, data: { loyaltyPointsEarned: pointsEarned, loyaltyPointsAwardedAt: new Date() } });
    });
  }

  // Cancelling or refunding an order undoes its loyalty effects: any points
  // spent on it come back (the purchase they paid for didn't happen), and
  // any points already earned on it (only possible if it was DELIVERED and
  // is now being refunded) are clawed back. Guarded by loyaltyPointsReversedAt
  // so this only ever runs once per order.
  private async reverseLoyaltyPoints(order: { id: string; userId: string; orderNumber: string; loyaltyPointsRedeemed: number; loyaltyPointsEarned: number }) {
    const netChange = order.loyaltyPointsRedeemed - order.loyaltyPointsEarned;

    await this.prisma.$transaction(async (tx) => {
      if (netChange !== 0) {
        const current = await tx.user.findUniqueOrThrow({ where: { id: order.userId } });
        const newBalance = Math.max(0, current.loyaltyPoints + netChange);
        await tx.user.update({ where: { id: order.userId }, data: { loyaltyPoints: newBalance } });
        await tx.loyaltyTransaction.create({
          data: {
            userId: order.userId,
            orderId: order.id,
            type: 'ADJUSTED',
            points: newBalance - current.loyaltyPoints,
            balanceAfter: newBalance,
            note: `لغو/بازگشت سفارش ${order.orderNumber}`,
          },
        });
      }
      await tx.order.update({ where: { id: order.id }, data: { loyaltyPointsReversedAt: new Date() } });
    });
  }

  // A one-time thank-you for bringing a friend, paid to both sides the
  // first time that friend's order is actually delivered — not at signup,
  // so it can't be farmed with throwaway accounts. Guarded by the referred
  // user's referralRewardedAt so it only ever fires once per relationship.
  // Deliberately not clawed back if this order is later refunded: unlike
  // awardLoyaltyPoints/reverseLoyaltyPoints, this bonus is a flat
  // relationship reward, not proportional to the order's value.
  private async awardReferralBonus(referredUserId: string, referrerUserId: string, orderNumber: string) {
    await this.prisma.$transaction(async (tx) => {
      const referredUser = await tx.user.update({
        where: { id: referredUserId },
        data: { loyaltyPoints: { increment: REFERRAL_BONUS_POINTS }, referralRewardedAt: new Date() },
      });
      await tx.loyaltyTransaction.create({
        data: {
          userId: referredUserId,
          type: 'REFERRAL_BONUS',
          points: REFERRAL_BONUS_POINTS,
          balanceAfter: referredUser.loyaltyPoints,
          note: 'پاداش معرفی — اولین خرید شما تحویل داده شد',
        },
      });

      const referrerUser = await tx.user.update({
        where: { id: referrerUserId },
        data: { loyaltyPoints: { increment: REFERRAL_BONUS_POINTS } },
      });
      await tx.loyaltyTransaction.create({
        data: {
          userId: referrerUserId,
          type: 'REFERRAL_BONUS',
          points: REFERRAL_BONUS_POINTS,
          balanceAfter: referrerUser.loyaltyPoints,
          note: `پاداش معرفی — دوست شما سفارش ${orderNumber} را دریافت کرد`,
        },
      });
    });

    await Promise.all([
      this.notifications.notify(referredUserId, 'SYSTEM', 'پاداش معرفی', `${REFERRAL_BONUS_POINTS} امتیاز وفاداری برای اولین خرید شما اضافه شد.`),
      this.notifications.notify(referrerUserId, 'SYSTEM', 'پاداش معرفی', `دوست شما اولین خرید خود را دریافت کرد و ${REFERRAL_BONUS_POINTS} امتیاز به شما اضافه شد.`),
    ]);
  }

  private generateOrderNumber() {
    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    return `SN-${datePart}-${randomInt(1000, 9999)}`;
  }
}
