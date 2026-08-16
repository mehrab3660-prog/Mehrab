import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AddWishlistItemDto } from './dto/wishlist.dto';

const wishlistInclude = {
  items: { include: { product: { include: { images: { take: 1 } } }, productVariant: true } },
};

@Injectable()
export class WishlistService {
  constructor(private prisma: PrismaService) {}

  private async getOrCreate(userId: string) {
    let wishlist = await this.prisma.wishlist.findFirst({ where: { userId }, include: wishlistInclude });
    if (!wishlist) wishlist = await this.prisma.wishlist.create({ data: { userId }, include: wishlistInclude });
    return wishlist;
  }

  get(userId: string) {
    return this.getOrCreate(userId);
  }

  async addItem(userId: string, dto: AddWishlistItemDto) {
    const product = await this.prisma.product.findUnique({ where: { id: dto.productId }, select: { basePrice: true } });
    if (!product) throw new BadRequestException('محصول یافت نشد');

    const wishlist = await this.getOrCreate(userId);
    await this.prisma.wishlistItem.upsert({
      where: {
        wishlistId_productId_productVariantId: {
          wishlistId: wishlist.id,
          productId: dto.productId,
          productVariantId: dto.productVariantId ?? '',
        },
      },
      create: {
        wishlistId: wishlist.id,
        productId: dto.productId,
        productVariantId: dto.productVariantId,
        priceAtAdd: product.basePrice,
      },
      update: {},
    });
    return this.getOrCreate(userId);
  }

  async removeItem(userId: string, itemId: string) {
    const item = await this.prisma.wishlistItem.findFirst({ where: { id: itemId, wishlist: { userId } } });
    if (!item) throw new NotFoundException('آیتم علاقه‌مندی یافت نشد');
    await this.prisma.wishlistItem.delete({ where: { id: itemId } });
    return this.getOrCreate(userId);
  }
}
