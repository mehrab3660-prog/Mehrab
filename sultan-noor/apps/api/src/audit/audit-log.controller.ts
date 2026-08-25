import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';

@Controller('audit-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN, Role.ADMIN)
export class AuditLogController {
  constructor(private prisma: PrismaService) {}

  @Get()
  list(@Query('entityType') entityType?: string, @Query('skip') skip?: string, @Query('take') take?: string) {
    return this.prisma.auditLog.findMany({
      where: entityType ? { entityType } : undefined,
      include: { user: { select: { fullName: true, phone: true } } },
      orderBy: { createdAt: 'desc' },
      skip: skip ? Number(skip) : undefined,
      take: take ? Number(take) : 50,
    });
  }
}
