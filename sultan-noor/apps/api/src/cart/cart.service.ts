import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProductsService } from '../catalog/products/products.service';
import { AddCartItemDto, UpdateCartItemDto } from './dto/cart.dto';

const cartInclude = {
  items: {
    include: { product: { include: { images: { take: 1 } } }, productVariant: true },
  },
};

@Injectable()
export class CartService {
  constructor(
    private prisma: PrismaService,
    private productsService: ProductsService,
  ) {}

  private async getOrCreateCart(userId: string) {
    let cart = await this.prisma.cart.findFirst({ where: { userId }, include: cartInclude });
    if (!cart) {
      cart = await this.prisma.cart.create({ data: { userId }, include: cartInclude });
    }
    return cart;
  }

  async getCart(userId: string) {
    return this.priceCart(await this.getOrCreateCart(userId), userId);
  }

  async addItem(userId: string, dto: AddCartItemDto) {
    const cart = await this.getOrCreateCart(userId);
    await this.prisma.cartItem.upsert({
      where: { cartId_productVariantId: { cartId: cart.id, productVariantId: dto.productVariantId ?? '' } },
      create: {
        cartId: cart.id,
        productId: dto.productId,
        productVariantId: dto.productVariantId,
        quantity: dto.quantity,
      },
      update: { quantity: { increment: dto.quantity } },
    });
    return this.getCart(userId);
  }

  async updateItem(userId: string, itemId: string, dto: UpdateCartItemDto) {
    const item = await this.prisma.cartItem.findFirst({ where: { id: itemId, cart: { userId } } });
    if (!item) throw new NotFoundException('آیتم سبد خرید یافت نشد');
    await this.prisma.cartItem.update({ where: { id: itemId }, data: { quantity: dto.quantity } });
    return this.getCart(userId);
  }

  async removeItem(userId: string, itemId: string) {
    const item = await this.prisma.cartItem.findFirst({ where: { id: itemId, cart: { userId } } });
    if (!item) throw new NotFoundException('آیتم سبد خرید یافت نشد');
    await this.prisma.cartItem.delete({ where: { id: itemId } });
    return this.getCart(userId);
  }

  async clear(userId: string) {
    const cart = await this.getOrCreateCart(userId);
    await this.prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    return this.getCart(userId);
  }

  private async priceCart(cart: Awaited<ReturnType<typeof this.getOrCreateCart>>, userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const items = await Promise.all(
      cart.items.map(async (item) => {
        const unitPrice = await this.productsService.resolveUnitPrice(
          item.productId,
          user?.customerGroupId ?? null,
          item.quantity,
        );
        return { ...item, unitPrice, lineTotal: unitPrice * item.quantity };
      }),
    );
    const subtotal = items.reduce((sum, i) => sum + i.lineTotal, 0);
    return { ...cart, items, subtotal };
  }
}
