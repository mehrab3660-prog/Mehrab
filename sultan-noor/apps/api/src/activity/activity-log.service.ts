import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface RecordActivityParams {
  userId?: string;
  event: string;
  metadata?: unknown;
  ipAddress?: string;
  userAgent?: string;
}

// General-purpose activity trail: logins, searches, product views — used for
// personalization, the AI advisor, and analytics dashboards.
@Injectable()
export class ActivityLogService {
  constructor(private prisma: PrismaService) {}

  async record(params: RecordActivityParams) {
    return this.prisma.activityLog.create({
      data: {
        userId: params.userId,
        event: params.event,
        metadata: params.metadata as any,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
      },
    });
  }
}
