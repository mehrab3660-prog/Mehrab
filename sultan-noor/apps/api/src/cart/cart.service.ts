import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProductsService } from '../catalog/products/products.service';
import { PricingService } from '../pricing/pricing.service';
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
    private pricingService: PricingService,
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
    // Stock reservation at checkout is keyed by variant — a cart item without
    // one silently skips inventory checks entirely. Never trust the client to
    // supply it: resolve it here so every line always tracks real stock.
    const productVariantId = dto.productVariantId ?? (await this.resolveDefaultVariantId(dto.productId));
    await this.prisma.cartItem.upsert({
      where: { cartId_productVariantId: { cartId: cart.id, productVariantId } },
      create: {
        cartId: cart.id,
        productId: dto.productId,
        productVariantId,
        quantity: dto.quantity,
      },
      update: { quantity: { increment: dto.quantity } },
    });
    // New activity on this cart — let a future abandonment be reminded
    // again, and this write also refreshes `updatedAt` (the abandonment
    // clock the recovery cron reads).
    await this.prisma.cart.update({ where: { id: cart.id }, data: { abandonedReminderSentAt: null } });
    return this.getCart(userId);
  }

  private async resolveDefaultVariantId(productId: string): Promise<string> {
    const variants = await this.prisma.productVariant.findMany({ where: { productId }, select: { id: true }, take: 2 });
    if (variants.length === 0) throw new BadRequestException('این محصول هیچ گزینه‌ی قابل خریدی ندارد');
    if (variants.length > 1) throw new BadRequestException('لطفاً یک گزینه از محصول را انتخاب کنید');
    return variants[0].id;
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

  async suggestDiscount(userId: string) {
    const cart = await this.getCart(userId);
    return this.pricingService.suggestBestDiscountCode(userId, cart.subtotal);
  }
}
