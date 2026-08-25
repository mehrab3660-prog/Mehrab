import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { deleteUploadedImage, saveUploadedImage } from '../common/utils/image-upload.util';
import { CreateReviewDto } from './dto/review.dto';

const IMAGE_DIR = process.env.REVIEW_IMAGE_STORAGE_DIR ?? path.join(process.cwd(), 'storage', 'reviews');

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
        images: { select: { id: true, url: true }, orderBy: { position: 'asc' } },
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
        images: { orderBy: { position: 'asc' } },
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
    const review = await this.prisma.review.findUnique({ where: { id }, include: { images: true } });
    if (!review) throw new NotFoundException('نظر یافت نشد');
    await this.prisma.review.delete({ where: { id } });
    for (const image of review.images) deleteUploadedImage(image.url, IMAGE_DIR);
    return { success: true };
  }

  async addImage(reviewId: string, userId: string, file: Express.Multer.File, baseUrl: string) {
    const review = await this.prisma.review.findUnique({ where: { id: reviewId } });
    if (!review) throw new NotFoundException('نظر یافت نشد');
    if (review.userId !== userId) throw new ForbiddenException('فقط نویسنده‌ی نظر می‌تواند عکس اضافه کند');

    const filename = saveUploadedImage(file, IMAGE_DIR);
    const position = await this.prisma.reviewImage.count({ where: { reviewId } });
    return this.prisma.reviewImage.create({
      data: { reviewId, url: `${baseUrl}/api/review-images/${filename}`, position },
    });
  }
}
