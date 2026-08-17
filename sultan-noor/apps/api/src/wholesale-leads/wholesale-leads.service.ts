import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateWholesaleLeadDto, UpdateWholesaleLeadStatusDto } from './dto/wholesale-lead.dto';

@Injectable()
export class WholesaleLeadsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  async create(dto: CreateWholesaleLeadDto) {
    const lead = await this.prisma.wholesaleLead.create({ data: dto });
    await this.notifyStaff(lead);
    return { message: 'درخواست همکاری شما ثبت شد؛ همکاران ما به‌زودی با شما تماس می‌گیرند.' };
  }

  async listAll(skip = 0, take = 20) {
    const [items, total] = await Promise.all([
      this.prisma.wholesaleLead.findMany({ skip, take, orderBy: { createdAt: 'desc' } }),
      this.prisma.wholesaleLead.count(),
    ]);
    return { items, total };
  }

  async updateStatus(id: string, dto: UpdateWholesaleLeadStatusDto) {
    const lead = await this.prisma.wholesaleLead.findUnique({ where: { id } });
    if (!lead) throw new NotFoundException('درخواست یافت نشد');
    return this.prisma.wholesaleLead.update({
      where: { id },
      data: { status: dto.status, adminNote: dto.adminNote },
    });
  }

  private async notifyStaff(lead: { companyName: string; contactName: string }) {
    const staff = await this.prisma.user.findMany({
      where: { role: { in: ['SUPER_ADMIN', 'ADMIN'] } },
      select: { id: true },
    });
    await Promise.all(
      staff.map((s) =>
        this.notifications.notify(
          s.id,
          'SYSTEM',
          'درخواست همکاری عمده‌فروشی جدید',
          `${lead.companyName} — ${lead.contactName}`,
        ),
      ),
    );
  }
}
