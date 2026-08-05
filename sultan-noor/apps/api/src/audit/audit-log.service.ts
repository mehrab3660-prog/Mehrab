import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface RecordAuditParams {
  userId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  ipAddress?: string;
}

// Records sensitive admin/staff mutations (product edits, order refunds, role
// changes, etc.) so every change to business-critical data is traceable.
@Injectable()
export class AuditLogService {
  constructor(private prisma: PrismaService) {}

  async record(params: RecordAuditParams) {
    return this.prisma.auditLog.create({
      data: {
        userId: params.userId,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        before: params.before as any,
        after: params.after as any,
        ipAddress: params.ipAddress,
      },
    });
  }
}
