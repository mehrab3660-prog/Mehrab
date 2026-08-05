import { Injectable } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsGateway } from './notifications.gateway';

@Injectable()
export class NotificationsService {
  constructor(
    private prisma: PrismaService,
    private gateway: NotificationsGateway,
  ) {}

  async notify(userId: string, type: NotificationType, title: string, body?: string, data?: unknown) {
    const notification = await this.prisma.notification.create({
      data: { userId, type, title, body, data: data as any },
    });
    this.gateway.emitToUser(userId, 'notification', notification);
    return notification;
  }

  list(userId: string) {
    return this.prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 50 });
  }

  async markRead(userId: string, id: string) {
    return this.prisma.notification.updateMany({ where: { id, userId }, data: { readAt: new Date() } });
  }

  async markAllRead(userId: string) {
    return this.prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
  }
}
