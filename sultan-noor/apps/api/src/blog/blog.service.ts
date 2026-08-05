import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBlogPostDto, UpdateBlogPostDto } from './dto/blog-post.dto';

@Injectable()
export class BlogService {
  constructor(private prisma: PrismaService) {}

  listPublished() {
    return this.prisma.blogPost.findMany({
      where: { isPublished: true },
      orderBy: { publishedAt: 'desc' },
      include: { author: { select: { fullName: true } } },
    });
  }

  async get(slug: string) {
    const post = await this.prisma.blogPost.findUnique({ where: { slug }, include: { author: { select: { fullName: true } } } });
    if (!post) throw new NotFoundException('مقاله یافت نشد');
    return post;
  }

  listAllForAdmin() {
    return this.prisma.blogPost.findMany({ orderBy: { createdAt: 'desc' } });
  }

  create(authorId: string, dto: CreateBlogPostDto) {
    return this.prisma.blogPost.create({ data: { ...dto, authorId } });
  }

  async update(id: string, dto: UpdateBlogPostDto) {
    const data = { ...dto, publishedAt: dto.isPublished ? new Date() : undefined };
    return this.prisma.blogPost.update({ where: { id }, data });
  }

  async remove(id: string) {
    await this.prisma.blogPost.delete({ where: { id } });
    return { success: true };
  }
}
