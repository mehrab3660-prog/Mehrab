import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { OrdersService } from '../orders/orders.service';
import { CreateReturnRequestDto, UpdateReturnRequestStatusDto } from './dto/return-request.dto';

const returnRequestInclude = {
  items: { include: { orderItem: true } },
  order: { select: { orderNumber: true } },
  user: { select: { fullName: true, phone: true } },
};

@Injectable()
export class ReturnsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private ordersService: OrdersService,
  ) {}

  async create(userId: string, dto: CreateReturnRequestDto) {
    const order = await this.prisma.order.findFirst({
      where: { id: dto.orderId, userId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('سفارش یافت نشد');
    if (order.status !== 'DELIVERED') {
      throw new BadRequestException('فقط سفارش‌های تحویل‌داده‌شده قابل مرجوع کردن هستند');
    }

    for (const item of dto.items) {
      const orderItem = order.items.find((i) => i.id === item.orderItemId);
      if (!orderItem) throw new BadRequestException('یکی از اقلام انتخاب‌شده به این سفارش تعلق ندارد');
      if (item.quantity > orderItem.quantity) {
        throw new BadRequestException(`تعداد درخواستی برای «${orderItem.nameSnapshot}» بیشتر از تعداد خریداری‌شده است`);
      }
    }

    const request = await this.prisma.returnRequest.create({
      data: {
        orderId: order.id,
        userId,
        reason: dto.reason,
        items: { create: dto.items.map((i) => ({ orderItemId: i.orderItemId, quantity: i.quantity })) },
      },
      include: returnRequestInclude,
    });

    const staff = await this.prisma.user.findMany({
      where: { role: { in: ['SUPER_ADMIN', 'ADMIN', 'STAFF'] } },
      select: { id: true },
    });
    await Promise.all(
      staff.map((s) =>
        this.notifications.notify(s.id, 'SYSTEM', 'درخواست مرجوعی جدید', `سفارش ${order.orderNumber} — درخواست مرجوعی ثبت شد.`),
      ),
    );

    return request;
  }

  listMine(userId: string) {
    return this.prisma.returnRequest.findMany({
      where: { userId },
      include: returnRequestInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  listAll() {
    return this.prisma.returnRequest.findMany({
      include: returnRequestInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateStatus(adminId: string, id: string, dto: UpdateReturnRequestStatusDto) {
    const request = await this.prisma.returnRequest.findUnique({ where: { id }, include: { order: true } });
    if (!request) throw new NotFoundException('درخواست مرجوعی یافت نشد');
    if (request.status !== 'PENDING' && dto.status !== 'REFUNDED') {
      throw new ForbiddenException('این درخواست قبلاً بررسی شده است');
    }
    if (dto.status === 'REFUNDED' && request.status !== 'APPROVED') {
      throw new BadRequestException('ابتدا باید درخواست تایید شود');
    }

    const updated = await this.prisma.returnRequest.update({
      where: { id },
      data: { status: dto.status, adminNote: dto.adminNote },
      include: returnRequestInclude,
    });

    if (dto.status === 'REFUNDED') {
      await this.ordersService.updateStatus(adminId, request.orderId, {
        status: 'REFUNDED',
        note: `بازگشت وجه بابت درخواست مرجوعی ${request.id}`,
      });
      await this.prisma.payment.updateMany({
        where: { orderId: request.orderId, status: 'SUCCEEDED' },
        data: { status: 'REFUNDED' },
      });
    } else {
      const title = dto.status === 'APPROVED' ? 'درخواست مرجوعی تایید شد' : 'درخواست مرجوعی رد شد';
      await this.notifications.notify(request.userId, 'SYSTEM', title, `سفارش ${request.order.orderNumber}: ${dto.adminNote ?? ''}`.trim());
    }

    return updated;
  }
}
