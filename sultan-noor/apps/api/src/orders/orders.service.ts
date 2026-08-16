import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomInt } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ProductsService } from '../catalog/products/products.service';
import { PricingService } from '../pricing/pricing.service';
import { InvoiceService } from './invoice/invoice.service';
import { AuditLogService } from '../audit/audit-log.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateOrderDto, UpdateOrderStatusDto } from './dto/order.dto';

const SHIPPING_FLAT_RATE = 50000; // تومان — نرخ ثابت ارسال برای MVP

@Injectable()
export class OrdersService {
  constructor(
    private prisma: PrismaService,
    private productsService: ProductsService,
    private pricingService: PricingService,
    private invoiceService: InvoiceService,
    private auditLog: AuditLogService,
    private notifications: NotificationsService,
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

    const shippingTotal = SHIPPING_FLAT_RATE;
    const grandTotal = Math.max(subtotal - discountTotal + shippingTotal, 0);
    const orderNumber = this.generateOrderNumber();

    const order = await this.prisma.$transaction(async (tx) => {
      // Reserve stock for variant-tracked items (best-effort at first available warehouse).
      for (const item of pricedItems) {
        if (!item.productVariantId) continue;
        const stock = await tx.stock.findFirst({
          where: { productVariantId: item.productVariantId, quantity: { gte: item.quantity } },
        });
        if (!stock) throw new BadRequestException(`موجودی کافی برای «${item.nameSnapshot}» وجود ندارد`);
        await tx.stock.update({ where: { id: stock.id }, data: { quantity: { decrement: item.quantity } } });
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
          items: { create: pricedItems },
          statusHistory: { create: { status: 'PENDING_PAYMENT', note: 'سفارش ثبت شد' } },
        },
        include: { items: true },
      });

      if (discountCodeId) {
        await tx.discountCode.update({ where: { id: discountCodeId }, data: { usedCount: { increment: 1 } } });
      }

      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });

      return created;
    });

    await this.notifications.notify(userId, 'ORDER_UPDATE', 'سفارش شما ثبت شد', `سفارش ${order.orderNumber} در انتظار پرداخت است.`);

    return order;
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
    const order = await this.prisma.order.findUnique({ where: { id } });
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

    if (dto.status === 'DELIVERED' || dto.status === 'PROCESSING') {
      await this.invoiceService.generateForOrder(id).catch(() => undefined);
    }

    return updated;
  }

  private generateOrderNumber() {
    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    return `SN-${datePart}-${randomInt(1000, 9999)}`;
  }
}
