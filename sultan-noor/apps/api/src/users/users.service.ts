import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';

const ADMIN_TIER_ROLES: Role[] = [Role.SUPER_ADMIN, Role.ADMIN];

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

  async updateRole(adminId: string, adminRole: Role, targetUserId: string, role: Role) {
    const before = await this.prisma.user.findUnique({ where: { id: targetUserId } });
    if (!before) throw new NotFoundException('کاربر یافت نشد');

    // Only SUPER_ADMIN may grant/revoke admin-tier roles or touch an
    // existing admin-tier account — an ADMIN must not be able to promote
    // itself (or anyone) to SUPER_ADMIN/ADMIN, nor modify one.
    if (adminRole !== Role.SUPER_ADMIN) {
      if (ADMIN_TIER_ROLES.includes(role) || ADMIN_TIER_ROLES.includes(before.role)) {
        throw new ForbiddenException('فقط مدیر ارشد می‌تواند نقش‌های مدیریتی را تغییر دهد');
      }
    }

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
