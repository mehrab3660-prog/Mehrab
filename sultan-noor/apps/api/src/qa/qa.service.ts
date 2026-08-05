import { Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateAnswerDto, CreateQuestionDto } from './dto/qa.dto';

@Injectable()
export class QaService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  listForProduct(productId: string) {
    // select (not include) at every level so no raw userId scalar is ever
    // returned to this public, unauthenticated endpoint.
    return this.prisma.question.findMany({
      where: { productId, isPublished: true },
      select: {
        id: true,
        body: true,
        createdAt: true,
        user: { select: { fullName: true } },
        answers: {
          select: {
            id: true,
            body: true,
            isFromStaff: true,
            createdAt: true,
            user: { select: { fullName: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  createQuestion(userId: string, dto: CreateQuestionDto) {
    return this.prisma.question.create({ data: { userId, productId: dto.productId, body: dto.body } });
  }

  async createAnswer(userId: string, userRole: Role, questionId: string, dto: CreateAnswerDto) {
    const question = await this.prisma.question.findUnique({ where: { id: questionId } });
    if (!question) throw new NotFoundException('پرسش یافت نشد');

    const staffRoles: Role[] = [Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF];
    const isFromStaff = staffRoles.includes(userRole);
    const answer = await this.prisma.answer.create({
      data: { userId, questionId, body: dto.body, isFromStaff },
    });

    if (isFromStaff) {
      await this.notifications.notify(question.userId, 'QA_REPLY', 'پاسخ به پرسش شما', dto.body);
    }

    return answer;
  }
}
