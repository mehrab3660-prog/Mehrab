import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReviewDto } from './dto/review.dto';

@Injectable()
export class ReviewsService {
  constructor(private prisma: PrismaService) {}

  listForProduct(productId: string) {
    // select (not include) so the review's own userId scalar is never
    // returned to this public, unauthenticated endpoint.
    return this.prisma.review.findMany({
      where: { productId, isApproved: true },
      select: {
        id: true,
        rating: true,
        title: true,
        body: true,
        createdAt: true,
        user: { select: { fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  create(userId: string, dto: CreateReviewDto) {
    return this.prisma.review.create({ data: { userId, productId: dto.productId, rating: dto.rating, title: dto.title, body: dto.body } });
  }

  listPending() {
    return this.prisma.review.findMany({
      where: { isApproved: false },
      include: {
        product: true,
        // Never the raw user row (passwordHash, nationalId) — only what the
        // moderation queue actually displays.
        user: { select: { fullName: true, phone: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async approve(id: string) {
    const review = await this.prisma.review.findUnique({ where: { id } });
    if (!review) throw new NotFoundException('نظر یافت نشد');
    return this.prisma.review.update({ where: { id }, data: { isApproved: true } });
  }

  async remove(id: string) {
    await this.prisma.review.delete({ where: { id } });
    return { success: true };
  }
}
