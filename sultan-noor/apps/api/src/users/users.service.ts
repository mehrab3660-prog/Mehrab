import { Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
  ) {}

  findMe(userId: string) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { addresses: true, customerGroup: true },
    });
  }

  async list(params: { skip?: number; take?: number; role?: Role }) {
    const where = params.role ? { role: params.role } : {};
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({ where, skip: params.skip, take: params.take ?? 20, orderBy: { createdAt: 'desc' } }),
      this.prisma.user.count({ where }),
    ]);
    return { items, total };
  }

  async updateRole(adminId: string, targetUserId: string, role: Role) {
    const before = await this.prisma.user.findUnique({ where: { id: targetUserId } });
    if (!before) throw new NotFoundException('کاربر یافت نشد');

    const after = await this.prisma.user.update({ where: { id: targetUserId }, data: { role } });

    await this.auditLog.record({
      userId: adminId,
      action: 'user.role_update',
      entityType: 'User',
      entityId: targetUserId,
      before: { role: before.role },
      after: { role: after.role },
    });

    return after;
  }
}
